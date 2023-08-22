import { nanoid } from 'nanoid';
import cron from 'node-cron';

import { ChainId, EventType } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';
import { AbstractProcess } from '@/lib/process/process.abstract';

import { config } from '../config';
import { Reservoir } from '../lib';
import { start } from './api';
import { initializeIndexerEventSyncing } from './indexer';
import { initializeIndexerEventProcessors } from './indexer/initialize-event-processors';
import { OrderEventsQueue, OrderJobData, OrderJobResult } from './order-events/order-events-queue';
import { FirestoreDeletionProcess } from './purge-firestore-v2/process';
import { JobData, QueueOfQueues } from './queue-of-queues';
import { redis } from './redis';
import { ReservoirOrderCacheQueue } from './reservoir-order-cache-queue';
import { SalesEventsQueue, SalesJobData, SalesJobResult } from './reservoir-sales-events/sales-events-queue';
import { RewardEventsQueue } from './rewards/rewards-queue';

let _supportedCollectionsProvider: SupportedCollectionsProvider;
const getSupportedCollectionsProvider = async () => {
  if (!_supportedCollectionsProvider) {
    const db = getDb();
    _supportedCollectionsProvider = new SupportedCollectionsProvider(db);
    await _supportedCollectionsProvider.init();
  }
  return _supportedCollectionsProvider;
};


async function main() {
  const db = getDb();
  const promises = [];

  if (config.components.validateOrderbook.enabled) {
    await start();
    const queue = new ValidateOrdersProcessor('validate-orders', redis, db, {
      enableMetrics: false,
      concurrency: 2,
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

    cron.schedule('0 0 2 * * *', async () => {
      await trigger();
    });
    await trigger();
    promises.push(queue.run());
  }

  if (config.components.cacheReservoirOrders.enabled) {
    const supportedChains = [ChainId.Mainnet, ChainId.Goerli];
    const supportedCollections = await getSupportedCollectionsProvider();
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

  if (config.components.syncOrders.enabled) {
    const supportedCollections = await getSupportedCollectionsProvider();
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

  if (config.components.syncSales.enabled) {
    const supportedCollections = await getSupportedCollectionsProvider();
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

  if (config.components.indexerEventSyncing.enabled) {
    logger.log('indexer', `Starting indexer event syncing!`);
    promises.push(initializeIndexerEventSyncing());
  }

  if (config.components.indexerEventProcessing.enabled) {
    logger.log('indexer', 'Starting indexer event processing');
    /**
     * Initialize on chain event processing - these are not chain specific
     */
    const eventProcessorsPromises = initializeIndexerEventProcessors();
    promises.push(eventProcessorsPromises);
  }

  if (config.components.rewards.enabled) {
    logger.log('rewards', `Starting rewards event processing!`);
    const queue = new RewardEventsQueue('reward-events-queue', redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const trigger = async () => {
      const id = nanoid();
      const jobData = {
        id: id,
      };
      await queue.add(jobData);
    };

    cron.schedule('*/15 * * * * *', async () => {
      logger.log('rewards', `Triggering rewards event processing!`)
      await trigger();
    });
    await trigger();
    promises.push(queue.run());
  }

  if (config.components.purgeFirestore.enabled) {
    logger.log('purge', 'Starting purge process');
    const queue = new FirestoreDeletionProcess(redis, {
      enableMetrics: false,
      concurrency: config.components.purgeFirestore.concurrency,
      debug: false,
      attempts: 3
    });

    const trigger = async () => {
      await queue.add({ id: 'search-collections', type: 'search-collections' });
      await queue.add({ id: 'purge-order-snapshots', type: 'purge-order-snapshots' });
      await queue.add({ id: 'trigger-purge-contract-events', type: 'trigger-purge-contract-events' });
      await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftSale });
      await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftListing });
      await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftOffer });
      await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftTransfer });
      await queue.add({ id: 'trigger-purge-orders', type: 'trigger-check-orders' });
    };

    if (config.components.purgeFirestore.runOnStartup) {
      await trigger();
    }
    promises.push(queue.run());
  }

  console.log(`Starting ${promises.length} items`)
  await Promise.all(promises);
}
void main();
