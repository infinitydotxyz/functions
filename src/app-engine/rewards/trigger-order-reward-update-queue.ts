import { Job } from 'bullmq';
import Redis from 'ioredis';
import PQueue from 'p-queue';

import { ONE_HOUR, ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { OrderEvents, OrderSnap, UpdateOrderRewardsEvent } from '@/lib/rewards-v2/orders/types';

import { ExecutionError, redlock } from '../redis';

interface JobData {
  id: string;
}

interface JobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
  numTriggered: number;
}

export class TriggerOrderRewardUpdateQueue extends AbstractProcess<JobData, JobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<JobData, JobResult>): Promise<JobResult> {
    const db = getDb();
    const lockDuration = 5000;
    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped',
        numTriggered: 0
      };
    }

    let numTriggered = 0;
    const id = `order:reward:update:trigger:lock`;

    try {
      await redlock.using([id], lockDuration, async () => {
        const ordersCollRef = db
          .collection('pixl')
          .doc('orderCollections')
          .collection('pixlOrders') as CollRef<OrderSnap>;
        const query = ordersCollRef
          .where('eligibleForRewards', '==', true)
          .where('lastRewardTimestamp', '<', Date.now() - ONE_HOUR)
          .orderBy('lastRewardTimestamp', 'asc')
          .orderBy('id', 'asc');

        const stream = streamQueryWithRef(query, (item) => [item.lastRewardTimestamp, item.id]);
        const createQueue = new PQueue({ concurrency: 20 });

        for await (const item of stream) {
          const update: UpdateOrderRewardsEvent = {
            kind: 'UPDATE_ORDER_REWARDS',
            id: item.data.mostRecentEvent.id + 1,
            mostRecentEventId: item.data.mostRecentEvent.id,
            orderId: item.data.id,
            timestamp: Date.now() - ONE_MIN, // subtract a min so reservoir events can be up to 1 min behind
            processed: false
          };

          const orderEventsRef = item.ref.collection('pixlOrderEvents') as CollRef<OrderEvents>;
          createQueue
            .add(async () => {
              try {
                numTriggered += 1;
                await orderEventsRef.doc(update.id.toString()).create(update);
              } catch (err) {
                console.warn(`Failed to trigger an update for order ${item.data.id}`, err);
              }
            })
            .catch((err) => {
              console.error(err);
            });
          if (createQueue.size > 300) {
            await createQueue.onIdle();
          }
        }
        await createQueue.onIdle();
      });

      return {
        id: job.data.id,
        status: 'completed',
        numTriggered
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${id}`);
      } else {
        this.error(`${err} `);
      }

      return {
        id: job.data.id,
        status: 'errored',
        numTriggered
      };
    }
  }
}
