import 'module-alias/register';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import {
  JobData,
  UpdateOrderStatusEventsProcessor
} from '@/lib/orderbook/process/update-order-status-events/update-order-status-events';

async function main() {
  const db = getDb();

  const id = `update-order-change-event`;
  const processor = new UpdateOrderStatusEventsProcessor(id, redis, db, {
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
