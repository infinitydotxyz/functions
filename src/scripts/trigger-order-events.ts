import 'module-alias/register';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { ErrorCode } from '@/lib/orderbook/errors';
import {
  JobData,
  TriggerReservoirOrderEventsProcessor
} from '@/lib/orderbook/process/trigger-reservoir-order-events/trigger-order-events';
import { ReservoirOrderEventTrigger } from '@/lib/orderbook/process/trigger-reservoir-order-events/trigger-processor';

import { config } from '../config';

async function main() {
  const db = getDb();

  const errorCode = ErrorCode.Unexpected;

  const supportedCollectionsProvider = new SupportedCollectionsProvider(db);
  await supportedCollectionsProvider.init();

  const triggerer = new ReservoirOrderEventTrigger(redis, db, supportedCollectionsProvider, {
    enableMetrics: false,
    concurrency: 1,
    debug: true,
    attempts: 1
  });

  const id = `trigger-order-events:env:${config.isDev ? 'dev' : 'prod'}:errorCode:${errorCode}`;
  const processor = new TriggerReservoirOrderEventsProcessor(id, redis, db, {
    enableMetrics: false,
    concurrency: 1,
    debug: true,
    attempts: 1,
    delay: 0
  });

  const numQueries = 1;

  const jobs = [];
  for (let queryNum = 0; queryNum < numQueries; queryNum++) {
    const jobData: JobData = {
      id: `${queryNum}`,
      queryNum,
      numQueries,
      errorCode
    };
    jobs.push(jobData);
  }

  await processor.add(jobs);

  await Promise.all([triggerer.run(), processor.run()]);
}

void main();
