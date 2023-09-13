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

const updateSource = (data: OrderStatEvent, source: OrdersStats) => {
  const isListing = data.isListing;
  const isNew = data.kind === 'NEW_ORDER';
  const isActive = data.kind === 'NEW_ORDER' || data.kind === 'ORDER_ACTIVE';
  const isInactive = data.kind === 'ORDER_INACTIVE';
  const isNearFloor = data.isNearFloor;
  const isBelowFloor = data.isBelowFloor;

  const isCancelled = data.kind === 'ORDER_CANCELLED';
  const isCollectionBid = data.isCollectionBid;

  if (isListing) {
    // new listings
    if (isNew) {
      source.numListings += 1;
    }
    if (isNew && isBelowFloor) {
      source.numListingsBelowFloor += 1;
    }
    if (isNew && isNearFloor) {
      source.numListingsNearFloor += 1;
    }

    // listings
    if (isActive) {
      source.numActiveListings += 1;
    } else if (!isInactive) {
      source.numActiveListings -= 1;
    }
    if (isActive && isBelowFloor) {
      source.numActiveListingsBelowFloor += 1;
    } else if (isInactive && isBelowFloor) {
      source.numActiveListingsBelowFloor -= 1;
    }
    if (isActive && isNearFloor) {
      source.numActiveListingsNearFloor += 1;
    } else if (isInactive && isNearFloor) {
      source.numActiveListingsNearFloor -= 1;
    }
  }

  if (!isListing) {
    // new bids
    if (isNew) {
      source.numBids += 1;
    }
    if (isNew && isBelowFloor) {
      source.numBidsBelowFloor += 1;
    }
    if (isNew && isNearFloor) {
      source.numBidsNearFloor += 1;
    }

    // bids
    if (isActive) {
      source.numActiveBids += 1;
    } else if (isInactive) {
      source.numActiveBids -= 1;
    }
    if (isActive && isBelowFloor) {
      source.numActiveBidsBelowFloor += 1;
    } else if (isInactive && isBelowFloor) {
      source.numActiveBidsBelowFloor -= 1;
    }
    if (isActive && isNearFloor) {
      source.numActiveBidsNearFloor += 1;
    } else if (isInactive && isNearFloor) {
      source.numActiveBidsNearFloor -= 1;
    }

    // new collection bids
    if (isNew && isCollectionBid) {
      source.numCollectionBids += 1;
    }
    if (isNew && isCollectionBid && isNearFloor) {
      source.numCollectionBidsNearFloor += 1;
    }
    if (isNew && isCollectionBid && isBelowFloor) {
      source.numCollectionBidsBelowFloor += 1;
    }

    // new active collection bids
    if (isActive && isCollectionBid) {
      source.numActiveCollectionBids += 1;
    } else if (isInactive && isCollectionBid) {
      source.numActiveCollectionBids -= 1;
    }
    if (isActive && isCollectionBid && isNearFloor) {
      source.numActiveCollectionBidsNearFloor += 1;
    } else if (isInactive && isCollectionBid && isNearFloor) {
      source.numActiveCollectionBidsNearFloor -= 1;
    }
    if (isActive && isCollectionBid && isBelowFloor) {
      source.numActiveCollectionBidsBelowFloor += 1;
    } else if (isInactive && isCollectionBid && isBelowFloor) {
      source.numActiveCollectionBidsBelowFloor -= 1;
    }
  }

  if (isCancelled) {
    source.numCancelledOrders += 1;
    if (isListing) {
      source.numCancelledListings += 1;
    } else {
      source.numCancelledBids += 1;
      if (isCollectionBid) {
        source.numCancelledCollectionBids += 1;
      }
    }
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
