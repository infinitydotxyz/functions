import { Job } from 'bullmq';
import Redis from 'ioredis';
import { ExecutionError } from 'redlock';

import { getDb } from '@/firestore/db';
import { getMap } from '@/firestore/get-map';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { OrderStatEvent } from '@/lib/rewards-v2/orders/types';
import {
  ChainOrderStats,
  ChainUserOrderStats,
  OrderStats,
  OrdersStats,
  TotalOrderStats,
  UserOrderStats,
  getDefaultChainOrderStats,
  getDefaultChainUserOrderStats,
  getDefaultTotalOrderStats,
  getDefaultUserOrderStats,
  getOrderRefs
} from '@/lib/rewards-v2/referrals/sdk';

import { redlock } from '../redis';

interface JobData {
  id: string;
}

interface JobResult {
  id: string;
  status: 'completed' | 'skipped' | 'errored';
}

const getChanges = (data: OrderStatEvent) => {
  const isListing = data.isListing;
  const isNew = data.kind === 'NEW_ORDER';
  const isActive = data.isActive;
  const wasActive = data.wasActive;
  const isCancelled = data.kind === 'ORDER_CANCELLED';
  const wasCancelled = data.wasCancelled;
  const isNearFloor = data.isNearFloor;
  const isBelowFloor = data.isBelowFloor;
  const wasNearFloor = data.wasNearFloor;
  const wasBelowFloor = data.wasBelowFloor;
  const isCollectionBid = data.isCollectionBid;

  const activeFlipped = isActive !== wasActive;
  const floorFlipped = isBelowFloor !== wasBelowFloor;
  const nearFloorFlipped = isNearFloor !== wasNearFloor;

  const activeFlippedPositive = activeFlipped && isActive;
  const floorFlippedPositive = floorFlipped && isBelowFloor;
  const nearFloorFlippedPositive = nearFloorFlipped && isNearFloor;

  const activeValue = activeFlipped && activeFlippedPositive ? 1 : activeFlipped ? -1 : 0;
  const belowFloorValue = floorFlipped && floorFlippedPositive ? 1 : floorFlipped ? -1 : 0;
  const nearFloorValue = nearFloorFlipped && nearFloorFlippedPositive ? 1 : nearFloorFlipped ? -1 : 0;

  const wasActiveAndBelowFloor = wasActive && wasBelowFloor;
  const isActiveAndBelowFloor = isActive && isBelowFloor;
  const activeAndBelowFloorFlipped = isActiveAndBelowFloor !== wasActiveAndBelowFloor;
  const activeAndBelowFloorFlippedPositive = activeAndBelowFloorFlipped && isActiveAndBelowFloor;
  const activeAndBelowFloorValue =
    activeAndBelowFloorFlipped && activeAndBelowFloorFlippedPositive ? 1 : activeAndBelowFloorFlipped ? -1 : 0;

  const wasActiveAndNearFloor = wasActive && wasNearFloor;
  const isActiveAndNearFloor = isActive && isNearFloor;
  const activeAndNearFloorFlipped = isActiveAndNearFloor !== wasActiveAndNearFloor;
  const activeAndNearFloorFlippedPositive = activeAndNearFloorFlipped && isActiveAndNearFloor;
  const activeAndNearFloorValue =
    activeAndNearFloorFlipped && activeAndNearFloorFlippedPositive ? 1 : activeAndNearFloorFlipped ? -1 : 0;

  const cancelledFlipped = wasCancelled !== isCancelled;
  const cancelledFlippedPositive = isCancelled && cancelledFlipped;
  const cancelledValue = cancelledFlipped && cancelledFlippedPositive ? 1 : cancelledFlipped ? -1 : 0;

  const stat: OrderStats = {
    numListings: isListing && isNew ? 1 : 0,
    numListingsBelowFloor: isListing ? belowFloorValue : 0,
    numListingsNearFloor: isListing ? nearFloorValue : 0,

    numActiveListings: isListing ? activeValue : 0,
    numActiveListingsBelowFloor: isListing ? activeAndBelowFloorValue : 0,
    numActiveListingsNearFloor: isListing ? activeAndNearFloorValue : 0,

    numBids: !isListing && isNew ? 1 : 0,
    numBidsBelowFloor: !isListing ? belowFloorValue : 0,
    numBidsNearFloor: !isListing ? nearFloorValue : 0,

    numActiveBids: !isListing ? activeValue : 0,
    numActiveBidsBelowFloor: !isListing ? activeAndBelowFloorValue : 0,
    numActiveBidsNearFloor: !isListing ? activeAndNearFloorValue : 0,

    numCollectionBids: !isListing && isCollectionBid ? activeValue : 0,
    numCollectionBidsBelowFloor: !isListing && isCollectionBid ? activeAndBelowFloorValue : 0,
    numCollectionBidsNearFloor: !isListing && isCollectionBid ? activeAndNearFloorValue : 0,

    numActiveCollectionBids: !isListing && isCollectionBid ? activeValue : 0,
    numActiveCollectionBidsBelowFloor: !isListing && isCollectionBid ? activeAndBelowFloorValue : 0,
    numActiveCollectionBidsNearFloor: !isListing && isCollectionBid ? activeAndNearFloorValue : 0,

    numCancelledListings: isListing ? cancelledValue : 0,
    numCancelledBids: !isListing ? cancelledValue : 0,
    numCancelledCollectionBids: !isListing && isCollectionBid ? cancelledValue : 0,
    numCancelledOrders: cancelledValue
  };

  return stat;
};

const updateSource = (data: OrderStatEvent, source: OrdersStats) => {
  const changes = getChanges(data);

  for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
    source[key] += changes[key];
  }
};

export class AggregateOrdersQueue extends AbstractProcess<JobData, JobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }
  public async run() {
    await super._run();
  }

  async processJob(job: Job<JobData, JobResult>): Promise<JobResult> {
    const db = getDb();
    const lockDuration = 5000;

    const id = `process-order-stats:lock`;

    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };

        const orderStatEventsRef = db
          .collection('pixl')
          .doc('orderCollections')
          .collection('orderStatEvents') as CollRef<OrderStatEvent>;

        const query = orderStatEventsRef
          .where('processed', '==', false)
          .orderBy('timestamp', 'asc')
          .orderBy('id', 'asc');
        const stream = streamQueryPageWithRef(query, (item) => [item.timestamp, item.id], { pageSize: 50 });

        for await (const page of stream) {
          if (page.length === 0) {
            return;
          }
          checkAbort();

          const refs = new Map<string, FirebaseFirestore.DocumentReference<OrdersStats>>();

          for (const { data } of page) {
            const orderRefs = Object.values(
              getOrderRefs(db, {
                user: data.user,
                chainId: data.chainId,
                timestamp: data.timestamp
              })
            );

            for (const ref of orderRefs) {
              refs.set(ref.path, ref);
            }
          }

          const { get, set, save: saveStats } = await getMap(db, refs);

          const batch = db.batch();
          for (const { data, ref } of page) {
            const orderRefs = getOrderRefs(db, {
              user: data.user,
              chainId: data.chainId,
              timestamp: data.timestamp
            });

            const totalOrders: TotalOrderStats =
              get(orderRefs.totalOrders.path) ?? set(orderRefs.totalOrders.path, getDefaultTotalOrderStats());
            const chainOrder: ChainOrderStats =
              get(orderRefs.chainOrders.path) ??
              set(orderRefs.chainOrders.path, getDefaultChainOrderStats(data.chainId));
            const userOrder: UserOrderStats =
              get(orderRefs.userOrders.path) ?? set(orderRefs.userOrders.path, getDefaultUserOrderStats(data.user));
            const chainUserOrders: ChainUserOrderStats =
              get(orderRefs.chainUserOrders.path) ??
              set(
                orderRefs.chainUserOrders.path,
                getDefaultChainUserOrderStats({ user: data.user, chainId: data.chainId })
              );
            const sources = [totalOrders, chainOrder, userOrder, chainUserOrders];

            for (const source of sources) {
              updateSource(data, source);
            }

            // mark the order event as processed
            batch.set(ref, { processed: true }, { merge: true });
          }
          saveStats(batch);
          await batch.commit();
        }
      });
      return {
        id: job.data.id,
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
        status: 'errored'
      };
    }
  }
}
