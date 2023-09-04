import { Job } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import Redis from 'ioredis';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { UserRewardEvent } from '@/lib/rewards-v2/referrals/sdk';

import { ExecutionError, redlock } from '../redis';
import { UserRewardsEventsQueue } from './user-rewards-queue';

export interface UserRewardsTriggerJobData {
  id: string;
}

export interface UserRewardsTriggerJobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
  numTriggered: number;
}

export class UserRewardsTriggerQueue extends AbstractProcess<UserRewardsTriggerJobData, UserRewardsTriggerJobResult> {
  constructor(
    id: string,
    redis: Redis,
    protected _userRewardsEventsQueue: UserRewardsEventsQueue,
    options?: ProcessOptions
  ) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(
    job: Job<UserRewardsTriggerJobData, UserRewardsTriggerJobResult, string>
  ): Promise<UserRewardsTriggerJobResult> {
    const db = getDb();
    const lockDuration = 5_000;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped',
        numTriggered: 0
      };
    }

    const id = `user:rewards:trigger:lock`;

    let numTriggered = 0;
    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };
        const events = db.collectionGroup('pixlUserRewardsEvents') as CollGroupRef<UserRewardEvent>;

        const query = events
          .where('processed', '==', false)
          .orderBy('timestamp', 'asc')
          .orderBy(FieldPath.documentId());

        const users = new Set();
        for await (const { data, ref } of streamQueryWithRef(query, (data, ref) => [data.timestamp, ref])) {
          console.log(ref.path);
          checkAbort();
          const { user } = data;

          if (users.has(user)) {
            continue;
          }

          await this._userRewardsEventsQueue.add({ id: ref.id, user });
          users.add(user);
          numTriggered += 1;
          if (numTriggered % 100 === 0) {
            this.log(`Triggered ${numTriggered} user reward events`);
          }
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
