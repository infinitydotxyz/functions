import { nanoid } from 'nanoid';
import cron from 'node-cron';

import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';
import { AbstractProcess } from '@/lib/process/process.abstract';

import { config } from '../config';
import { Reservoir } from '../lib';
import { OrderEventsQueue, OrderJobData, OrderJobResult } from './order-events-queue';
import { JobData, QueueOfQueues } from './queue-of-queues';
import { redis } from './redis';
import { ReservoirOrderCacheQueue } from './reservoir-order-cache-queue';
import { SalesEventsQueue, SalesJobData, SalesJobResult } from './sales-events-queue';

async function main() {
  const db = getDb();
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  const promises = [];

  if (config.components.validateOrderbook) {
    const queue = new ValidateOrdersProcessor('validate-orders', redis, db, {
      enableMetrics: false,
      concurrency: 4,
      debug: true,
      attempts: 1
    });

    const trigger = async () => {
      const id = nanoid();
      const jobs = [];
      const numQueries = 16;

      for (const chainId of config.supportedChains) {
        for (const isSellOrder of [true, false]) {
          for (let queryNum = 0; queryNum < numQueries; queryNum++) {
            const jobData = {
              id: `${id}:${chainId}:${isSellOrder}:${queryNum}`,
              queryNum,
              isSellOrder,
              concurrentReservoirRequests: 2,
              chainId,
              numQueries,
              executionId: id
            };
            jobs.push(jobData);
          }
        }
      }
      await queue.add(jobs);
    };

    cron.schedule('0 2 * * *', async () => {
      await trigger();
    });
    promises.push(queue.run());
  }

  if (config.components.cacheReservoirOrders) {
    const supportedChains = [ChainId.Mainnet, ChainId.Goerli];
    for (const chainId of supportedChains) {
      const bidCacheQueue = new ReservoirOrderCacheQueue(
        `reservoir-order-cache:chain:${chainId}:type:bid`,
        redis,
        supportedCollections
      );
      const askCacheQueue = new ReservoirOrderCacheQueue(
        `reservoir-order-cache:chain:${chainId}:type:ask`,
        redis,
        supportedCollections
      );

      cron.schedule('*/5 * * * * *', async () => {
        await bidCacheQueue.add({
          id: `bid-cache-${chainId}-${Date.now()}`,
          chainId,
          side: 'bid'
        });

        await askCacheQueue.add({
          id: `ask-cache-${chainId}-${Date.now()}`,
          chainId,
          side: 'ask'
        });
      });

      promises.push(bidCacheQueue.run());
      promises.push(askCacheQueue.run());
    }
  }

  if (config.components.syncOrders) {
    const initQueue = (id: string, queue: AbstractProcess<JobData<OrderJobData>, { id: string }>) => {
      const orderEventsQueue = new OrderEventsQueue(id, redis, supportedCollections, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 1
      });
      orderEventsQueue.enqueueOnComplete(queue);
      return orderEventsQueue;
    };

    const queue = new QueueOfQueues<OrderJobData, OrderJobResult>(redis, 'reservoir-order-events-sync', initQueue, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 3
    });

    const trigger = async () => {
      const syncsRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);
      const syncsQuery = syncsRef.where('metadata.isPaused', '==', false);
      const syncs = await syncsQuery.get();

      for (const doc of syncs.docs) {
        const syncMetadata = doc.data();
        if (syncMetadata) {
          await queue.add({
            id: `reservoir-order-event-sync:${doc.ref.id}`,
            queueId: `reservoir-order-event-sync:${doc.ref.id}`,
            job: {
              id: `reservoir-order-event-sync:${doc.ref.id}`,
              syncMetadata: syncMetadata.metadata,
              syncDocPath: doc.ref.path
            }
          });
        }
      }
    };

    await trigger();
    cron.schedule('*/2 * * * *', async () => {
      await trigger();
    });
    promises.push(queue.run());
  }

  if (config.components.syncSales) {
    const initQueue = (id: string, queue: AbstractProcess<JobData<SalesJobData>, { id: string }>) => {
      const salesEventsQueue = new SalesEventsQueue(id, redis, supportedCollections, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 1
      });
      salesEventsQueue.enqueueOnComplete(queue);
      return salesEventsQueue;
    };

    const queue = new QueueOfQueues<SalesJobData, SalesJobResult>(redis, 'reservoir-sales-events-sync', initQueue, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 3
    });

    const trigger = async () => {
      const syncsRef = Reservoir.Sales.SyncMetadata.getSaleEventSyncsRef(db);
      const syncsQuery = syncsRef.where('metadata.isPaused', '==', false);
      const syncs = await syncsQuery.get();

      for (const doc of syncs.docs) {
        const syncMetadata = doc.data();
        if (syncMetadata) {
          await queue.add({
            id: `reservoir-sale-event-sync:${doc.ref.id}`,
            queueId: `reservoir-sale-event-sync:${doc.ref.id}`,
            job: {
              id: `reservoir-sale-event-sync:${doc.ref.id}`,
              syncMetadata: syncMetadata.metadata,
              syncDocPath: doc.ref.path
            }
          });
        }
      }
    };

    await trigger();
    cron.schedule('*/2 * * * *', async () => {
      await trigger();
    });
    promises.push(queue.run());
  }

  await Promise.all(promises);
}

void main();
