import { Job } from 'bullmq';
import 'module-alias/register';
import PQueue from 'p-queue';

import {
  ChainId,
  OrderEventKind,
  OrderRevalidationEvent,
  RawFirestoreOrder,
  RawOrderWithoutError
} from '@infinityxyz/lib/types/core';
import { ONE_HOUR, firestoreConstants } from '@infinityxyz/lib/utils';
import { Flow, SeaportBase, SeaportV11, SeaportV14 } from '@reservoir0x/sdk';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { CollRef, DocRef, Query } from '@/firestore/types';
import { Reservoir } from '@/lib/index';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/utils/ethersUtils';

import { getOrderStatus } from '../../indexer/validate-orders';
import { GasSimulator } from '../../order';
import { BaseOrder } from '../../order/base-order';
import { OrderUpdater } from '../../order/order-updater';
import { AbstractOrderbookProcessor } from '../orderbook-processor';
import { JobData, JobResult } from './validate-orders';

export default async function (job: Job<JobData, JobResult>) {
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

    const checkpointKey = `validate-orders:env:${config.isDev ? 'dev' : 'prod'}:chain:${chainId}:executionId:${
      job.data.executionId
    }:numQueries:${numQueries}:queryNum:${queryNum}:isSellOrder:${isSellOrder}`;
    const checkpoint = await redis.get(checkpointKey);

    const saveCheckpoint = async (ref: DocRef<RawFirestoreOrder>) => {
      await redis.set(checkpointKey, ref.path, 'PX', ONE_HOUR * 12);
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
            if (item.data.metadata.source !== 'flow') {
              itemById.set(item.data.metadata.id, item);
            } else if (item.data.rawOrder && (item.data.rawOrder as RawOrderWithoutError)?.rawOrder) {
              try {
                const flowOrder = new Flow.Order(
                  parseInt(item.data.metadata.chainId, 10),
                  (item.data.rawOrder as RawOrderWithoutError).rawOrder
                );

                const status = await getOrderStatus(flowOrder);

                logger.log(name, `${item.data.metadata.id} ${item.data.order?.status} => ${status}`);
                const timestamp = Date.now();
                const orderEvent: OrderRevalidationEvent = {
                  metadata: {
                    id: `REVALIDATE:${timestamp}`,
                    isSellOrder,
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
              } catch (err) {
                itemById.set(item.data.metadata.id, item);
              }
            }
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
                  logger.warn(name, `Could not find order ${reservoirOrder.id}`);
                  continue;
                }

                const status = reservoirOrder.status;
                const itemStatus = item.data.order?.status;

                let updated = false;
                /**
                 * mark unsigned seaport orders as inactive
                 */
                if (chainId === ChainId.Goerli) {
                  switch (reservoirOrder.kind) {
                    case 'seaport': {
                      if (item.data.order?.status === 'inactive') {
                        updated = true;
                      } else {
                        const order = new SeaportV11.Order(
                          5,
                          reservoirOrder.rawData as SeaportBase.Types.OrderComponents
                        );
                        if (!order.params.signature) {
                          logger.log(name, `${item.data.metadata.id} no signature`);
                          const orderEvent: OrderRevalidationEvent = {
                            metadata: {
                              id: `REVALIDATE:${timestamp}:${index}`,
                              isSellOrder,
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
                              status: 'inactive' as const
                            }
                          };

                          const orderEventRef = item.ref.collection('orderEvents').doc(orderEvent.metadata.id);
                          await batchHandler.addAsync(orderEventRef, orderEvent, { merge: false });
                          updated = true;
                        }
                      }
                      break;
                    }
                    case 'seaport-v1.4': {
                      if (item.data.order?.status === 'inactive') {
                        updated = true;
                      } else {
                        const order = new SeaportV14.Order(
                          5,
                          reservoirOrder.rawData as SeaportBase.Types.OrderComponents
                        );
                        if (!order.params.signature) {
                          logger.log(name, `${item.data.metadata.id} no signature`);
                          const orderEvent: OrderRevalidationEvent = {
                            metadata: {
                              id: `REVALIDATE:${timestamp}:${index}`,
                              isSellOrder,
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
                              status: 'inactive' as const
                            }
                          };

                          const orderEventRef = item.ref.collection('orderEvents').doc(orderEvent.metadata.id);
                          await batchHandler.addAsync(orderEventRef, orderEvent, { merge: false });
                          updated = true;
                        }
                      }
                      break;
                    }
                    default:
                      break;
                  }
                }

                if (!updated && status !== itemStatus) {
                  logger.log(name, `${item.data.metadata.id} ${itemStatus} => ${status}`);
                  const orderEvent: OrderRevalidationEvent = {
                    metadata: {
                      id: `REVALIDATE:${timestamp}:${index}`,
                      isSellOrder,
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
                } else if (
                  !updated &&
                  item.data?.order?.gasUsage === 0 &&
                  item.data.order.status === 'active' &&
                  item.data.metadata.source !== 'flow'
                ) {
                  logger.log('validate-orders', `validating order: ${item.data.metadata.id}`);
                  try {
                    const provider = getProvider(item.data.metadata.chainId);
                    const gasSimulator = new GasSimulator(
                      provider,
                      config.orderbook.gasSimulationAccount[item.data.metadata.chainId]
                    );

                    const baseOrder = new BaseOrder(
                      item.data.metadata.id,
                      item.data.metadata.chainId,
                      item.data.order.isSellOrder,
                      db,
                      provider,
                      gasSimulator
                    );
                    const { displayOrder } = await baseOrder.load();

                    const orderUpdater = new OrderUpdater(item.data, displayOrder);
                    const gasUsage = await baseOrder.getGasUsage(item.data);

                    orderUpdater.setGasUsage(gasUsage);

                    await baseOrder.save(orderUpdater.rawOrder, orderUpdater.displayOrder);
                  } catch (err) {
                    logger.error(name, `Failed to update gas usage ${err}`);
                  }
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
    logger.error(name, `${err}`);
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
