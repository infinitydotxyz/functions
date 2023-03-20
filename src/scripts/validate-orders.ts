import 'module-alias/register';

import { ChainId } from '@infinityxyz/lib/types/core';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';

async function main() {
  const isSellOrder = true;
  const executionId = 'manual';

  const id = `validate-orders:${isSellOrder}:`;
  const processor = new ValidateOrdersProcessor(id, redis, getDb(), {
    enableMetrics: false,
    concurrency: 2,
    debug: true,
    attempts: 1
  });
  const numQueries = 16;

  const jobs = [];
  for (let queryNum = 0; queryNum < numQueries; queryNum++) {
    const jobData = {
      id: `${queryNum}`,
      queryNum,
      isSellOrder,
      concurrentReservoirRequests: 2,
      chainId: ChainId.Goerli,
      numQueries,
      executionId
    };
    jobs.push(jobData);
  }

  await processor.add(jobs);

  await processor.run();
}

void main();
