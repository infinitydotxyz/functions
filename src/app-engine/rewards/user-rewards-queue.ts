import { Job } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import Redis from 'ioredis';

import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
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

    const id = `user:${job.data.user}:rewards:events:lock`;
    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id} - User ${job.data.user}`);
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
        const stream = streamQueryPageWithRef(query, (item, ref) => [item.timestamp, ref], { pageSize: 100 });
        const { data: userRewards, ref: userRewardsRef } = await getUserRewards(db, job.data.user);
        for await (const page of stream) {
          const batch = db.batch();
          for (const { data: event, ref } of page) {
            checkAbort();
            switch (event.kind) {
              case 'referral': {
                userRewards.referralPoints += event.totalPoints;
                userRewards.numReferrals += 1;
                break;
              }
              case 'order': {
                userRewards.listingPoints += event.totalPoints;
                break;
              }
              case 'buy': {
                userRewards.buyPoints += event.totalPoints;
                break;
              }
              case 'airdrop': {
                userRewards.airdropTier = event.tier;
                break;
              }
              case 'airdrop_boost': {
                userRewards.airdropBoosted = true;
                break;
              }
              default: {
                throw new Error(`Unknown event kind: ${(event as { kind: string }).kind}`);
              }
            }
            batch.set(ref, { processed: true }, { merge: true });
          }
          userRewards.totalPoints = userRewards.referralPoints + userRewards.listingPoints + userRewards.buyPoints;
          batch.set(userRewardsRef, userRewards, { merge: true });
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
        this.error(`Failed to process reward events for user ${job.data.user} ${err} `);
      }

      return {
        id: job.data.id,
        status: 'errored'
      };
    }
  }
}
