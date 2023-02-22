import { Job } from 'bullmq';
import 'module-alias/register';
import PQueue from 'p-queue';

import { OrderStatusEvent, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, DocRef } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { WithTiming } from '@/lib/process/types';

import { AbstractOrderbookProcessor } from '../orderbook-processor';
import { JobData, JobResult } from './update-order-status-events';

export default async function (job: Job<JobData>): Promise<WithTiming<JobResult>> {
  const name = 'update-order-status-events';
  const start = Date.now();

  let numOrders = 0;

  try {
    const queryNum = job.data.queryNum;
    const numQueries = job.data.numQueries;

    const db = getDb();
    const ref = db.collection(firestoreConstants.ORDERS_V2_COLL) as CollRef<RawFirestoreOrder>;

    const validSells = ref.where('order.isValid', '==', true);

    let query = AbstractOrderbookProcessor.getSplitOrderQuery(validSells, numQueries)[queryNum];
    if (!query) {
      throw new Error('Invalid query');
    }

    const checkpointKey = `${name}:env:${config.isDev ? 'dev' : 'prod'}:numQueries:${numQueries}:queryNum:${queryNum}`;

    const saveCheckpoint = async (ref: DocRef<RawFirestoreOrder>) => {
      await redis.set(checkpointKey, ref.path);
    };

    const checkpoint = await redis.get(checkpointKey);
    if (checkpoint) {
      query = query.startAfter(db.doc(checkpoint));
    }

    const interval = setInterval(() => {
      const rate = numOrders / ((Date.now() - start) / 1000);
      logger.log(
        name,
        `Queue Num ${queryNum}/${numQueries} processed: ${numOrders}. Rate: ${Math.floor(rate)} orders/s`
      );
    }, 10_000);
    const stream = streamQueryWithRef(query, undefined, { pageSize: 300 });

    const batchHandler = new BatchHandler();
    const queue = new PQueue({ concurrency: 20 });
    for await (const { data, ref } of stream) {
      queue
        .add(async () => {
          const order = data.order;
          const orderStatusEventsRef = ref.collection('orderStatusChanges') as CollRef<OrderStatusEvent>;
          const collection = order?.collection;
          if (collection) {
            const statusEventStream = streamQueryWithRef(orderStatusEventsRef);
            for await (const statusEvent of statusEventStream) {
              await batchHandler.addAsync(statusEvent.ref, { collection }, { merge: true });
            }
          }
          numOrders += 1;

          if (numOrders % 1000 === 0) {
            await saveCheckpoint(ref);
          }
        })
        .catch((err) => {
          logger.error(name, err);
        });
    }
    await queue.onIdle();
    await batchHandler.flush();
    clearInterval(interval);
    logger.log(name, `Queue Num ${queryNum}/${numQueries} Completed. Processed: ${numOrders} orders`);
  } catch (err) {
    logger.error(name, JSON.stringify(err));
  }
  const end = Date.now();
  return {
    numOrders,
    timing: {
      created: job.timestamp,
      started: start,
      completed: end
    }
  };
}
