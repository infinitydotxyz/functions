import { Job } from 'bullmq';
import 'module-alias/register';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { redlock } from '@/app-engine/redis';
import { logger } from '@/lib/logger';
import { handleTakeOrderFilledEvents } from '@/lib/orderbook/indexer/sales';
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

  const key = `flow-take-order:lock`;

  await redlock.using([key], 3_000, { retryCount: 3, retryDelay: 1500 }, async () => {
    try {
      logger.log(`indexer`, `Acquired lock - Handling take order events`);
      await handleTakeOrderFilledEvents();
    } catch (err) {
      logger.error('indexer', `Failed to handle take order events ${err}`);
    }
  });

  return {
    id: job.data.id,
    timing: {
      created: job.timestamp,
      started: start,
      completed: Date.now()
    }
  };
}
