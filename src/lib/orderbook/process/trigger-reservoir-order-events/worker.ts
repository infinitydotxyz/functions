import { Job } from 'bullmq';
import { BigNumber } from 'ethers';
import 'module-alias/register';

import { FirestoreDisplayOrder, OrderSource, RawFirestoreOrder } from '@infinityxyz/lib/types/core';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef, DocRef, Query } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { Orderbook } from '@/lib/index';
import { logger } from '@/lib/logger';
import { WithTiming } from '@/lib/process/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { BaseOrder } from '../../order/base-order';
import { JobData, JobResult } from './trigger-order-events';

const splitQueries = (
  ref: CollGroupRef<ReservoirOrderEvent> | CollRef<ReservoirOrderEvent> | Query<ReservoirOrderEvent>,
  numQueries: number
) => {
  const max = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const queries = [];
  const len = max.toHexString().length;
  for (let i = 0; i < numQueries; i++) {
    const start = max.mul(i).div(numQueries).toHexString().padEnd(len, '0');
    const end = max
      .mul(i + 1)
      .div(numQueries)
      .toHexString();

    const startId = i === 0 ? '0'.padEnd(39, '0') : '9'.padEnd(39, '9');
    const endId = '9'.padEnd(39, '9');

    const startPath = `ordersV2/${start}/reservoirOrderEvents/${startId}`;
    const endPath = `ordersV2/${end}/reservoirOrderEvents/${endId}`;
    queries.push(ref.where('__name__', '>=', startPath).where('__name__', '<=', endPath));
  }

  return queries;
};

export default async function (job: Job<JobData>): Promise<WithTiming<JobResult>> {
  const name = 'trigger-reservoir-order-events';
  const start = Date.now();
  let numOrderEvents = 0;
  let triggered = 0;
  const { queryNum, numQueries } = job.data;

  const interval = setInterval(() => {
    const rate = numOrderEvents / ((Date.now() - start) / 1000);
    logger.log(
      name,
      `Queue Num ${queryNum}/${numQueries} processed: ${numOrderEvents}. Rate: ${Math.floor(rate)} orders/s`
    );
  }, 10_000);

  try {
    const db = getDb();
    const orderEvents = db.collectionGroup('reservoirOrderEvents') as unknown as Query<ReservoirOrderEvent>;

    let query = splitQueries(orderEvents, numQueries)[queryNum];
    if (!query) {
      throw new Error('Invalid query');
    }
    const checkpointKey = `trigger-reservoir-order-events:env:${
      config.isDev ? 'dev' : 'prod'
    }:numQueries:${numQueries}:queryNum:${queryNum}`;
    const checkpoint = await redis.get(checkpointKey);
    const saveCheckpoint = async (ref: DocRef<ReservoirOrderEvent>) => {
      logger.log(name, `Query num ${queryNum} Saving checkpoint!`);
      await redis.set(checkpointKey, ref.path);
    };

    if (checkpoint) {
      logger.log(name, `Resuming from checkpoint ${checkpoint}`);
      query = query.startAfter(db.doc(checkpoint));
    }

    const supportedCollectionsProvider = new SupportedCollectionsProvider(db);
    await supportedCollectionsProvider.init();

    const batch = new BatchHandler(300);
    const trigger = async (data: ReservoirOrderEvent, ref: DocRef<ReservoirOrderEvent>, reason: string) => {
      const contract = data.data.order.contract;
      const source = data.data.order.source.toLowerCase();
      if (
        !supportedCollectionsProvider.has(`${data.metadata.chainId}:${contract}`) &&
        source !== 'infinity' &&
        source !== 'flow'
      ) {
        logger.log(name, `Found unsupported order ${ref.path} - Deleting`);
        const orderRef = ref.parent.parent as DocRef<RawFirestoreOrder>;
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          await db.recursiveDelete(orderRef);
        } else {
          const provider = getProvider(data.metadata.chainId);
          const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
          const baseOrder = new BaseOrder(
            data.metadata.id,
            data.metadata.chainId,
            data.metadata.isSellOrder,
            db,
            provider,
            gasSimulator
          );

          const chainDisplayRef = db
            .collection('ordersV2ByChain')
            .doc(data.metadata.chainId)
            .collection('chainV2Orders')
            .doc(data.metadata.id) as DocRef<FirestoreDisplayOrder>;

          const displayOrderSnap = await chainDisplayRef.get();
          const displayOrder = displayOrderSnap.data();
          if (displayOrder) {
            await baseOrder.delete(displayOrder);
          } else {
            await db.recursiveDelete(orderRef);
          }
        }
      }
      triggered += 1;
      data.data.order.contract;
      await batch.addAsync(
        ref,
        {
          metadata: {
            ...data.metadata,
            processed: false,
            hasError: false
          },
          error: null
        },
        { merge: true }
      );

      const rate = numOrderEvents / ((Date.now() - start) / 1000);
      const triggerRate = triggered / ((Date.now() - start) / 1000);
      logger.log(
        name,
        `Triggering event ${ref.path} \tRate ${rate.toFixed(2)} docs/s \tTrigger Rate ${triggerRate.toFixed(2)} docs/s`
      );
      logger.log(name, `\t${reason} \tRate ${rate.toFixed(2)} docs/s`);
    };

    const stream = streamQueryWithRef(query);

    let mostRecentRef;
    for await (const { data, ref } of stream) {
      mostRecentRef = ref;
      numOrderEvents += 1;
      if ('error' in data && data.error && data.error.errorCode !== 1) {
        switch (data.error.reason) {
          case 'Invalid complication address': {
            await trigger(data, ref, data.error.reason);
            break;
          }

          case 'unexpected order: unexpected order: error': {
            if (data.error.value.includes('failed to get reservoir order')) {
              await trigger(data, ref, 'failed to get reservoir order');
            } else {
              logger.log(name, `Unhandled reason: ${data.error.reason} - ${data.error.value}`);
            }
            break;
          }
          case 'unsupported order: unsupported order: dynamic order': {
            break;
          }
          case 'unsupported order: unsupported order: non-erc721 order': {
            break;
          }
          case 'unexpected order: unexpected order: not found': {
            break;
          }
          case 'unsupported order: unsupported order: order currency': {
            break;
          }
          case 'unsupported order: unsupported order: order side': {
            if (data.error.value.includes('buy')) {
              break;
            } else {
              logger.log(name, `Unhandled reason: ${data.error.reason} - ${data.error.value} - ${ref.path}`);
            }
            break;
          }
          default: {
            if (data.error.reason.includes('No txHash found for event')) {
              await trigger(data, ref, 'No txHash found for event');
            } else {
              logger.log(name, `Unhandled reason: ${data.error.reason} - ${data.error.value} - ${ref.path}`);
            }
          }
        }
      }
      if (numOrderEvents % 1000 === 0) {
        await batch.flush();
        await saveCheckpoint(ref);
      }
    }
    await batch.flush();
    if (mostRecentRef) {
      await saveCheckpoint(mostRecentRef);
    }
  } catch (err) {
    logger.error(name, err);
  }

  clearInterval(interval);

  const end = Date.now();
  return {
    numOrderEvents,
    timing: {
      created: job.timestamp,
      started: start,
      completed: end
    }
  };
}
