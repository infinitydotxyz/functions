import { Job } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import Redis from 'ioredis';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { processRewardEvents } from '@/lib/rewards-v2';
import { RewardsEvent } from '@/lib/rewards-v2/referrals/sdk';

import { ExecutionError, redlock } from '../redis';

export interface RewardJobData {
  id: string;
}

export interface RewardJobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
}

export class RewardEventsQueue extends AbstractProcess<RewardJobData, RewardJobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<RewardJobData, RewardJobResult, string>): Promise<RewardJobResult> {
    const db = getDb();
    const lockDuration = 5_000;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped'
      };
    }

    const id = `rewards:events:lock`;
    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };

        const rewardEventsRef = db
          .collection('pixl')
          .doc('pixlRewards')
          .collection('pixlRewardEvents') as CollRef<RewardsEvent>;
        const query = rewardEventsRef
          .where('processed', '==', false)
          .orderBy('timestamp', 'asc')
          .orderBy(FieldPath.documentId());

        const stream = streamQueryWithRef<RewardsEvent>(query, (item, ref) => [item.timestamp, ref.id]);
        for await (const { numProcessed } of processRewardEvents(stream)) {
          if (numProcessed % 100 === 0) {
            this.log(`Processed ${numProcessed} reward events`);
          }
          checkAbort();
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
