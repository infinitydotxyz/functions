import { Job } from 'bullmq';
import Redis from 'ioredis';
import QuickLRU from 'quick-lru';
import { ExecutionError } from 'redlock';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { OrderEvents } from '@/lib/rewards-v2/orders/types';

import { redlock } from '../redis';
import { ProcessOrderEventsQueue } from './process-order-events-queue';

export interface OrderEventsTriggerQueueJobData {
  id: string;
}

export interface OrderEventsTriggerQueueJobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
  numTriggered: number;
}

export class OrderEventsTriggerQueue extends AbstractProcess<
  OrderEventsTriggerQueueJobData,
  OrderEventsTriggerQueueJobResult
> {
  constructor(id: string, protected orderEventsQueue: ProcessOrderEventsQueue, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(
    job: Job<OrderEventsTriggerQueueJobData, OrderEventsTriggerQueueJobResult>
  ): Promise<OrderEventsTriggerQueueJobResult> {
    const db = getDb();
    const lockDuration = 5000;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped',
        numTriggered: 0
      };
    }

    const id = `order:events:trigger:lock`;
    let numTriggered = 0;

    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };
        const ref = db.collectionGroup('pixlOrderEvents') as CollGroupRef<OrderEvents>;
        const cache = new QuickLRU({ maxSize: 200 });
        const query = ref.where('processed', '==', false).orderBy('timestamp', 'asc').orderBy('orderId', 'asc');
        const stream = streamQueryWithRef(query, (item, ref) => [item.timestamp, item.orderId]);
        let batch: string[] = [];
        for await (const { data } of stream) {
          checkAbort();
          if (!cache.has(data.orderId)) {
            batch.push(data.orderId);
            numTriggered += 1;
            if (numTriggered % 100 === 0) {
              this.log(`Triggered ${numTriggered} order events`);
            }
            cache.set(data.orderId, null);
          }
          if (batch.length >= 500) {
            await this.orderEventsQueue.add(batch.map((item) => ({ id: item, orderId: item })));
            batch = [];
          }
        }
        if (batch.length > 0) {
          await this.orderEventsQueue.add(batch.map((item) => ({ id: item, orderId: item })));
          batch = [];
        }
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
