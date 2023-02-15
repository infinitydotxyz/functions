import 'module-alias/register';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import {
  JobData,
  TriggerReservoirOrderEventsProcessor
} from '@/lib/orderbook/process/trigger-reservoir-order-events/trigger-order-events';

import { config } from '../config';

async function main() {
  const db = getDb();
  const id = `trigger-order-events:env:${config.isDev ? 'dev' : 'prod'}`;
  const processor = new TriggerReservoirOrderEventsProcessor(id, redis, db, {
    enableMetrics: false,
    concurrency: 32,
    debug: true,
    attempts: 1,
    delay: 0
  });

  const numQueries = 32;

  const jobs = [];
  for (let queryNum = 0; queryNum < numQueries; queryNum++) {
    const jobData: JobData = {
      id: `${queryNum}`,
      queryNum,
      numQueries
    };
    jobs.push(jobData);
  }

  await processor.add(jobs);

  await processor.run();
}

void main();
