import { Job } from 'bullmq';
import 'module-alias/register';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { useLock } from '@/app-engine/redis';
import { logger } from '@/lib/logger';
import { markOrdersAsExpired } from '@/lib/orderbook/indexer/timestamps';
import { WithTiming } from '@/lib/process/types';

import { JobData, JobResult } from '.';

export default async function (job: Job<JobData>): Promise<WithTiming<JobResult>> {
  const start = Date.now();
  if (job.timestamp < Date.now() - 15 * ONE_MIN) {
    return {
      id: job.data.id,
      timing: {
        created: job.timestamp,
        started: start,
        completed: Date.now()
      }
    };
  }

  // const key = `order-expiration:lock`;

  // await useLock(key, 5000, async (signal) => {
  try {
    logger.log(`indexer`, `Acquired lock - Handling expiration events`);
    await markOrdersAsExpired();
  } catch (err) {
    logger.error('indexer', `Failed to handle expiration events ${err}`);
  }
  // });

  return {
    id: job.data.id,
    timing: {
      created: job.timestamp,
      started: start,
      completed: Date.now()
    }
  };
}
