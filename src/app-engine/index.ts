import cron from 'node-cron';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

import { config } from '../config';
import { Reservoir } from '../lib';
import { JobData, JobResult, OrderEventsQueue } from './order-events-queue';
import { QueueOfQueues } from './queue-of-queues';
import { redis } from './redis';
import { SalesEventsQueue, JobData as SalesJobData, JobResult as SalesJobResult } from './sales-events-queue';

async function main() {
  const db = getDb();
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  const promises = [];

  if (config.syncs.processOrders) {
    const initQueue = (id: string) => {
      const orderEventsQueue = new OrderEventsQueue(id, redis, supportedCollections, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 1
      });
      return orderEventsQueue;
    };

    const queue = new QueueOfQueues<JobData, JobResult>(redis, 'reservoir-order-events-sync', initQueue, {
      enableMetrics: false,
      concurrency: 20,
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
            id: doc.ref.path,
            queueId: doc.ref.path,
            job: {
              id: doc.ref.path,
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

  if (config.syncs.processSales) {
    const initQueue = (id: string) => {
      const salesEventsQueue = new SalesEventsQueue(id, redis, supportedCollections, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 1
      });
      return salesEventsQueue;
    };

    const queue = new QueueOfQueues<SalesJobData, SalesJobResult>(redis, 'reservoir-sales-events-sync', initQueue, {
      enableMetrics: false,
      concurrency: 20,
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
            id: doc.ref.path,
            queueId: doc.ref.path,
            job: {
              id: doc.ref.path,
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
