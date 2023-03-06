import { Job } from 'bullmq';
import 'module-alias/register';
import PQueue from 'p-queue';

import { OrderEventKind, OrderRevalidationEvent, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { CollRef, DocRef, Query } from '@/firestore/types';
import { Reservoir } from '@/lib/index';
import { logger } from '@/lib/logger';

import { AbstractOrderbookProcessor } from '../orderbook-processor';

export default async function (job: Job) {
  const name = 'validate-orders';
  const start = Date.now();
  let numOrders = 0;
  try {
    const queryNum = job.data.queryNum;
    const isSellOrder = job.data.isSellOrder;
    const numQueries = job.data.numQueries;
    const chainId = job.data.chainId;
    const concurrentReservoirRequests = job.data.concurrentReservoirRequests;

    const db = getDb();
    const ref = db.collection(firestoreConstants.ORDERS_V2_COLL) as CollRef<RawFirestoreOrder>;

    const validSells = ref
      .where('order.isValid', '==', true)
      .where('order.isSellOrder', '==', isSellOrder) as Query<RawFirestoreOrder>;

    let query = AbstractOrderbookProcessor.getSplitOrderQuery(validSells, numQueries)[queryNum];

    const checkpointKey = `validate-orders:env:${
      config.isDev ? 'dev' : 'prod'
    }:chain:${chainId}:numQueries:${numQueries}:queryNum:${queryNum}:isSellOrder:${isSellOrder}`;
    const checkpoint = await redis.get(checkpointKey);

    const saveCheckpoint = async (ref: DocRef<RawFirestoreOrder>) => {
      await redis.set(checkpointKey, ref.path);
    };

    if (checkpoint) {
      query = query.startAfter(db.doc(checkpoint));
    }

    if (!query) {
      throw new Error('Invalid query');
    }

    const start = Date.now();
    const interval = setInterval(() => {
      const rate = numOrders / ((Date.now() - start) / 1000);
      logger.log(
        name,
        `Queue Num ${queryNum}/${numQueries} processed: ${numOrders}. Rate: ${Math.floor(rate)} orders/s`
      );
    }, 10_000);

    const stream = streamQueryPageWithRef(query, undefined, { pageSize: 100 });
    const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
    const pageQueue = new PQueue({ concurrency: concurrentReservoirRequests });
    for await (const page of stream) {
      pageQueue
        .add(async () => {
          const batchHandler = new BatchHandler();
          const itemById = new Map<string, { data: RawFirestoreOrder; ref: DocRef<RawFirestoreOrder> }>();
          for (const item of page) {
            itemById.set(item.data.metadata.id, item);
          }

          const ids = page.map((item) => item.data.metadata.id);

          if (ids.length > 0) {
            try {
              const timestamp = Date.now();
              const method = isSellOrder
                ? Reservoir.Api.Orders.AskOrders.getOrders
                : Reservoir.Api.Orders.BidOrders.getOrders;
              const orders = await method(client, {
                ids
              });
              let index = 0;

              for (const reservoirOrder of orders.data.orders) {
                const item = itemById.get(reservoirOrder.id);
                if (!item) {
                  throw new Error('Could not find item');
                }

                const status = reservoirOrder.status;
                const itemStatus = item.data.order?.status;

                if (status !== itemStatus) {
                  logger.log(name, `${item.data.metadata.id} ${itemStatus} => ${status}`);
                  const orderEvent: OrderRevalidationEvent = {
                    metadata: {
                      id: `REVALIDATE:${timestamp}:${index}`,
                      isSellOrder: true,
                      orderId: item.data.metadata.id,
                      chainId: item.data.metadata.chainId,
                      processed: false,
                      migrationId: 1,
                      eventKind: OrderEventKind.Revalidation,
                      timestamp,
                      updatedAt: timestamp,
                      eventSource: 'infinity-orderbook'
                    },
                    data: {
                      status: status
                    }
                  };

                  const orderEventRef = item.ref.collection('orderEvents').doc(orderEvent.metadata.id);
                  await batchHandler.addAsync(orderEventRef, orderEvent, { merge: false });
                }
                index += 1;
              }
              await batchHandler.flush();
            } catch (err) {
              console.error(err);
            }

            const lastItem = page[page.length - 1];
            if (lastItem) {
              await saveCheckpoint(lastItem.ref);
            }
            numOrders += page.length;
          }
        })
        .catch((err) => {
          logger.error(name, err);
        });

      if (pageQueue.size > 5 * concurrentReservoirRequests) {
        await pageQueue.onEmpty();
      }
    }

    logger.log(name, `Waiting for ${pageQueue.size} pages to finish`);
    await pageQueue.onIdle();
    clearInterval(interval);
    logger.log(name, `Finished ${pageQueue.size} pages`);
  } catch (err) {
    logger.error(name, err);
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
