import { Job } from 'bullmq';
import { BigNumber } from 'ethers';
import Redis from 'ioredis';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import {
  OrderActiveEvent,
  OrderEvents,
  OrderInactiveEvent,
  OrderRewardEvent,
  OrderSnap,
  OrderStatEvent
} from '@/lib/rewards-v2/orders/types';

import { ExecutionError, redlock } from '../redis';

interface ProcessOrderEventsJobData {
  id: string;
  orderId: string;
}

interface ProcessorderEventsJobResult {
  id: string;
  orderId: string;
  status: 'completed' | 'skipped' | 'errored';
}

export class ProcessOrderEventsQueue extends AbstractProcess<ProcessOrderEventsJobData, ProcessorderEventsJobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }
  public async run() {
    await super._run();
  }

  async processJob(
    job: Job<ProcessOrderEventsJobData, ProcessorderEventsJobResult>
  ): Promise<ProcessorderEventsJobResult> {
    const db = getDb();
    const lockDuration = 5000;

    const id = `process-order-events:order:${job.data.orderId}`;
    try {
      const ordersRef = db.collection('pixl').doc('orderCollections').collection('pixlOrders') as CollRef<OrderSnap>;
      const orderRef = ordersRef.doc(job.data.orderId);
      const orderEventsRef = orderRef.collection('pixlOrderEvents') as CollRef<OrderEvents>;
      const orderStatsCollRef = db
        .collection('pixl')
        .doc('orderCollections')
        .collection('orderStatEvents') as CollRef<OrderStatEvent>;
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };
        const orderEventsQuery = orderEventsRef.where('processed', '==', false);
        const orderSnap = await orderRef.get();
        let order = orderSnap.data();
        const orderEventsSnap = await orderEventsQuery.get();
        checkAbort();
        const orderEvents = orderEventsSnap.docs
          .map((item) => {
            return {
              data: item.data(),
              ref: item.ref
            };
          })
          .sort((a, b) => {
            return BigNumber.from(a.data.id).gte(b.data.id) ? 1 : -1;
          });

        const isFillable = (status: OrderInactiveEvent['status'] | OrderActiveEvent['status']) => {
          const fillableStatuses = ['inactive', 'active'] as (
            | OrderInactiveEvent['status']
            | OrderActiveEvent['status']
          )[];
          return fillableStatuses.includes(status);
        };

        const isEligibleForRewards = (event: OrderActiveEvent | OrderInactiveEvent) => {
          return event.isListing && event.status === 'active';
        };

        const isBelowFloor = (event: OrderActiveEvent | OrderInactiveEvent) => {
          return event.priceUsd <= event.floorPriceUsd;
        };

        const isNearFloor = (event: OrderActiveEvent | OrderInactiveEvent) => {
          return event.priceUsd >= event.floorPriceUsd * 0.9 && event.priceUsd <= event.floorPriceUsd * 1.1;
        };

        let saves: ((batch: BatchHandler) => Promise<void>)[] = [];
        for (let i = 0; i < orderEvents.length; i += 1) {
          const event = orderEvents[i];
          const data = event.data;
          const isUpdate = data.kind === 'UPDATE_ORDER_REWARDS';

          // skip any updates that are not the most recent event
          if (isUpdate && i < orderEvents.length - 1) {
            saves.push(async (batchHandler: BatchHandler) => {
              await batchHandler.addAsync(event.ref, { processed: true }, { merge: true });
            });
            this.log(`Skipping update ${event.ref.id}`)
            continue;
          }

          // skip any updates if another event has been created since the time the update was issued
          if (isUpdate && order && order?.mostRecentEvent.id !== data.mostRecentEventId) {
            saves.push(async (batchHandler: BatchHandler) => {
              await batchHandler.addAsync(event.ref, { processed: true }, { merge: true });
            });
            this.log(`Skipping update ${event.ref.id}`)
            continue;
          }

          let nextOrder;
          if (isUpdate) {
            if (!order) {
              throw new Error(`Received UPDATE_ORDER_REWARDS event before order has been created`);
            }
            // updates don't change the order, just trigger rewards to be aggregated
            const timestamp = Math.min(data.timestamp, order.expiresAt);
            nextOrder = {
              ...order,
              mostRecentEvent: {
                kind: order.mostRecentEvent.kind,
                status: order.mostRecentEvent.status,
                isListing: order.mostRecentEvent.isListing,
                id: data.id,
                orderId: data.orderId,
                expiresAt: order.mostRecentEvent.expiresAt,
                blockNumber: order.mostRecentEvent.blockNumber,
                timestamp: timestamp,
                processed: true,
                priceUsd: order.mostRecentEvent.priceUsd,
                collection: order.mostRecentEvent.collection,
                chainId: order.mostRecentEvent.chainId,
                floorPriceUsd: order.mostRecentEvent.floorPriceUsd,
                maker: order.mostRecentEvent.maker,
                isCollectionBid: order.mostRecentEvent.isCollectionBid
              } as OrderActiveEvent | OrderInactiveEvent,
              lastRewardTimestamp: timestamp,
            };
          } else {
            nextOrder = {
              id: data.orderId,
              chainId: data.chainId,
              isListing: data.isListing,
              expiresAt: data.expiresAt,
              priceUsd: data.priceUsd,
              collection: data.collection,
              isFillable: isFillable(data.status),
              status: data.status,
              mostRecentEvent: data,
              maker: data.maker,
              lastRewardTimestamp: Math.min(data.timestamp, data.expiresAt),
              eligibleForRewards: isEligibleForRewards(data)
            };
          }

          // TODO should we ensure the price is greater than the floor price here?
          if (!!order && (order.eligibleForRewards || nextOrder.eligibleForRewards)) {
            // calculate rewards since last event and save a reward event
            const startTime = order.lastRewardTimestamp;
            const endTime = nextOrder.lastRewardTimestamp;

            const startPrice = order.mostRecentEvent.priceUsd;
            const startFloor = order.mostRecentEvent.floorPriceUsd;

            const endPrice = nextOrder.mostRecentEvent.priceUsd;
            const endFloor = nextOrder.mostRecentEvent.floorPriceUsd;
            const reward: OrderRewardEvent = {
              kind: 'ORDER_REWARD',
              chainId: order.chainId,
              collection: order.collection,
              orderId: order.id,
              id: order.mostRecentEvent.id,
              start: {
                priceUsd: startPrice,
                blockNumber: order.mostRecentEvent.blockNumber,
                timestamp: startTime,
                floorPriceUsd: startFloor
              },
              end: {
                priceUsd: endPrice,
                blockNumber: nextOrder.mostRecentEvent.blockNumber,
                timestamp: endTime,
                floorPriceUsd: endFloor
              },
              user: order.maker,
              timestamp: Date.now(),
              processed: false
            };
            saves.push(async (batch: BatchHandler) => {
              const ref = db.collection('pixl').doc('pixlRewards').collection('pixlRewardEvents').doc(reward.id);
              await batch.addAsync(ref, reward, { merge: true });
            });
          }

          // new order
          if (!order) {
            if (isUpdate) {
              throw new Error(`Attempted to save a NEW_ORDER event for an update. Order ${nextOrder.id}`)
            }
            // new order
            const newOrderEvent: OrderStatEvent = {
              kind: 'NEW_ORDER',
              id: nextOrder.id,
              chainId: nextOrder.chainId,
              user: nextOrder.maker,
              isListing: nextOrder.isListing,
              isBelowFloor: isBelowFloor(nextOrder.mostRecentEvent),
              isNearFloor: isNearFloor(nextOrder.mostRecentEvent),
              isCollectionBid: nextOrder.mostRecentEvent.isCollectionBid,
              timestamp: Date.now(),
              processed: false
            };
            saves.push(async (batch: BatchHandler) => {
              const ref = orderStatsCollRef.doc(newOrderEvent.id);
              await batch.addAsync(ref, newOrderEvent, { merge: true });
            });
          }

          // inactive order
          if (order && order.mostRecentEvent.status === 'active' && nextOrder.mostRecentEvent.status !== 'active') {
            if (isUpdate) {
              throw new Error(`Attempted to save an ORDER_INACTIVE event for an update. Order ${nextOrder.id}`)
            }
            const orderInactive: OrderStatEvent = {
              kind: 'ORDER_INACTIVE',
              chainId: nextOrder.chainId,
              user: nextOrder.maker,
              id: nextOrder.mostRecentEvent.id,
              isListing: nextOrder.isListing,
              isBelowFloor: isBelowFloor(nextOrder.mostRecentEvent),
              isNearFloor: isNearFloor(nextOrder.mostRecentEvent),
              isCollectionBid: nextOrder.mostRecentEvent.isCollectionBid,
              timestamp: Date.now(),
              processed: false
            };
            saves.push(async (batch: BatchHandler) => {
              const ref = orderStatsCollRef.doc(orderInactive.id);
              await batch.addAsync(ref, orderInactive, { merge: true });
            });
          }

          // active order
          if (order && order.mostRecentEvent.status !== 'active' && nextOrder.mostRecentEvent.status === 'active') {
            if (isUpdate) {
              throw new Error(`Attempted to save an ORDER_ACTIVE event for an update. Order ${nextOrder.id}`)
            }
            const orderActive: OrderStatEvent = {
              kind: 'ORDER_ACTIVE',
              chainId: nextOrder.chainId,
              user: nextOrder.maker,
              id: nextOrder.mostRecentEvent.id,
              isListing: nextOrder.isListing,
              isBelowFloor: isBelowFloor(nextOrder.mostRecentEvent),
              isNearFloor: isNearFloor(nextOrder.mostRecentEvent),
              isCollectionBid: nextOrder.mostRecentEvent.isCollectionBid,
              timestamp: Date.now(),
              processed: false
            };
            saves.push(async (batch: BatchHandler) => {
              const ref = orderStatsCollRef.doc(orderActive.id);
              await batch.addAsync(ref, orderActive, { merge: true });
            });
          }

          // cancelled order
          if (order && order.mostRecentEvent.status === 'cancelled') {
            if (isUpdate) {
              throw new Error(`Attempted to save an ORDER_CANCELLED event for an update. Order ${nextOrder.id}`)
            }
            const orderInactive: OrderStatEvent = {
              kind: 'ORDER_CANCELLED',
              chainId: nextOrder.chainId,
              user: nextOrder.maker,
              id: nextOrder.mostRecentEvent.id,
              isListing: nextOrder.isListing,
              isBelowFloor: isBelowFloor(nextOrder.mostRecentEvent),
              isNearFloor: isNearFloor(nextOrder.mostRecentEvent),
              isCollectionBid: nextOrder.mostRecentEvent.isCollectionBid,
              timestamp: Date.now(),
              processed: false
            };
            saves.push(async (batch: BatchHandler) => {
              const ref = orderStatsCollRef.doc(orderInactive.id);
              await batch.addAsync(ref, orderInactive, { merge: true });
            });
          }

          // mark the event as processed
          saves.push(async (batchHandler: BatchHandler) => {
            await batchHandler.addAsync(event.ref, { processed: true }, { merge: true });
          });
          order = nextOrder;
        }

        // save the order
        if (order) {
          saves.push(async (batchHandler: BatchHandler) => {
            await batchHandler.addAsync(orderRef, order as OrderSnap, { merge: true });
          });
        }

        checkAbort();
        const batchHandler = new BatchHandler(100);
        for (const save of saves) {
          await save(batchHandler);
        }
        await batchHandler.flush();
      });

      return {
        id: job.data.id,
        orderId: job.data.orderId,
        status: 'completed'
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${id}`);
      } else {
        this.error(`${err}`);
      }
      return {
        id: job.data.id,
        orderId: job.data.orderId,
        status: 'errored'
      };
    }
  }
}
