import { Job } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import Redis from 'ioredis';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { paginatedTransaction } from '@/firestore/paginated-transaction';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { UserRewardEvent, getUserRewards } from '@/lib/rewards-v2/referrals/sdk';

import { ExecutionError, redlock } from '../redis';

export interface UserRewardsJobData {
  id: string;
  user: string;
}

export interface UserRewardsJobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
}

export class UserRewardsEventsQueue extends AbstractProcess<UserRewardsJobData, UserRewardsJobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<UserRewardsJobData, UserRewardsJobResult, string>): Promise<UserRewardsJobResult> {
    const db = getDb();
    const lockDuration = 5_000;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped'
      };
    }

    const id = `user:${job.data.user}:rewards:events:lock`;
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
          .collection('pixlUserRewards')
          .doc(job.data.user)
          .collection('pixlUserRewardsEvents') as CollRef<UserRewardEvent>;

        const query = rewardEventsRef
          .where('processed', '==', false)
          .orderBy('timestamp', 'asc')
          .orderBy(FieldPath.documentId());
        await paginatedTransaction(query, db, { pageSize: 100, maxPages: 10 }, async ({ data, txn }) => {
          checkAbort();
          const { data: userRewards, ref: userRewardsRef } = await getUserRewards(db, job.data.user, txn);
          for (const item of data.docs) {
            const event = item.data();
            switch (event.kind) {
              case 'referral': {
                userRewards.referralPoints += event.totalPoints;
                break;
              }
              case 'listing': {
                // listing events contain the total points for the user
                userRewards.listingPoints = event.totalPoints;
                break;
              }
              case 'buy': {
                userRewards.buyPoints += event.totalPoints;
                break;
              }
              case 'airdrop': {
                userRewards.airdropPoints += event.totalPoints;
                break;
              }
              default: {
                throw new Error(`Unknown event kind: ${event.kind}`);
              }
            }
            txn.set(item.ref, { processed: true }, { merge: true });
          }
          userRewards.totalPoints =
            userRewards.referralPoints + userRewards.listingPoints + userRewards.buyPoints + userRewards.airdropPoints;
          txn.set(userRewardsRef, userRewards, { merge: true });
        });
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
