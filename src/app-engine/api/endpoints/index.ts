import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';

import { ChainId } from '@infinityxyz/lib/types/core';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';

export default async function register(fastify: FastifyInstance) {
  fastify.put('/orderbook/:chain/validate', async (request) => {
    const chain =
      typeof request.params == 'object' &&
      request.params &&
      'chain' in request.params &&
      typeof request.params.chain === 'string'
        ? request.params.chain
        : '';

    const trigger = async () => {
      const id = nanoid();
      const jobs = [];
      const numQueries = 16;

      const queue = new ValidateOrdersProcessor('validate-orders', redis, getDb(), {
        enableMetrics: false,
        concurrency: 0,
        debug: true,
        attempts: 1
      });

      for (const isSellOrder of [true, false]) {
        for (let queryNum = 0; queryNum < numQueries; queryNum++) {
          const jobData = {
            id: `${id}:${chain}:${isSellOrder}:${queryNum}`,
            queryNum,
            isSellOrder,
            concurrentReservoirRequests: 2,
            chainId: chain as ChainId,
            numQueries,
            executionId: id
          };
          jobs.push(jobData);
        }
      }
      await queue.add(jobs);
    };

    await trigger();
    return;
  });

  await Promise.resolve();
}
