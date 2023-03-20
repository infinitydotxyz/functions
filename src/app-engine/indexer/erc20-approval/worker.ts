import { Job } from 'bullmq';
import 'module-alias/register';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { redlock } from '@/app-engine/redis';
import { logger } from '@/lib/logger';
import { handleErc20ApprovalEvents } from '@/lib/orderbook/indexer/erc20';
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

  const key = `erc20-approval:lock`;

  await redlock.using([key], 3_000, { retryCount: 3, retryDelay: 1500 }, async () => {
    try {
      logger.log(`indexer`, `Acquired lock - Handling erc20 approval events`);
      await handleErc20ApprovalEvents();
    } catch (err) {
      logger.error('indexer', `Failed to handle erc20 approval events ${err}`);
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
