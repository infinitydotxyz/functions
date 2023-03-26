import { Job } from 'bullmq';
import 'module-alias/register';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { useLock } from '@/app-engine/redis';
import { logger } from '@/lib/logger';
import { handleMatchOrderFilledEvents } from '@/lib/orderbook/indexer/sales';
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

  // const key = `flow-match-order:lock`;

  // await useLock(key, 5000, async (signal) => {
  try {
    logger.log(`indexer`, `Acquired lock - Handling match order events`);
    await handleMatchOrderFilledEvents();
  } catch (err) {
    logger.error('indexer', `Failed to handle match order events ${err}`);
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
