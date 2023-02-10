import cron from 'node-cron';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

import { config } from '../config';
import { Reservoir } from '../lib';
import { OrderEventsQueue } from './order-events-queue';
import { redis } from './redis';
import { SalesEventsQueue } from './sales-events-queue';

async function main() {
  const db = getDb();
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  const promises = [];

  if (config.syncs.processOrders) {
    const orderEventsQueue = new OrderEventsQueue(redis, supportedCollections, {
      enableMetrics: false,
      concurrency: 30,
      debug: true,
      attempts: 1
    });

    const trigger = async () => {
      const syncsRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);
      const syncsQuery = syncsRef.where('metadata.isPaused', '==', false);
      const syncs = await syncsQuery.get();

      for (const doc of syncs.docs) {
        const syncMetadata = doc.data();
        if (syncMetadata) {
          await orderEventsQueue.add({
            id: doc.ref.path,
            syncMetadata: syncMetadata,
            syncDocPath: doc.ref.path
          });
        }
      }
    };

    await trigger();
    cron.schedule('*/5 * * * *', async () => {
      await trigger();
    });
    promises.push(orderEventsQueue.run());
  }

  if (config.syncs.processSales) {
    const salesQueue = new SalesEventsQueue(redis, supportedCollections, {
      enableMetrics: false,
      concurrency: 30,
      debug: true,
      attempts: 1
    });

    const trigger = async () => {
      const syncsRef = Reservoir.Sales.SyncMetadata.getSaleEventSyncsRef(db);
      const syncsQuery = syncsRef.where('metadata.isPaused', '==', false);
      const syncs = await syncsQuery.get();

      for (const doc of syncs.docs) {
        const syncMetadata = doc.data();
        if (syncMetadata) {
          await salesQueue.add({
            id: doc.ref.path,
            syncMetadata: syncMetadata,
            syncDocPath: doc.ref.path
          });
        }
      }
    };

    await trigger();
    cron.schedule('*/5 * * * *', async () => {
      await trigger();
    });
    promises.push(salesQueue.run());
  }

  await Promise.all(promises);
}

void main();
