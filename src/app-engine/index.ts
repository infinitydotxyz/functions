import { nanoid } from 'nanoid';
import cron from 'node-cron';

import { ChainId, EventType } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';

import { config } from '../config';
import { start } from './api';
import { initializeIndexerEventSyncing } from './indexer';
import { initializeIndexerEventProcessors } from './indexer/initialize-event-processors';
import { FirestoreDeletionProcess } from './purge-firestore-v2/process';
import { redis } from './redis';
import { ReservoirOrderCacheQueue } from './reservoir-order-cache-queue';
import { SalesEventsQueue } from './reservoir-sales-events/sales-events-queue';
import { AggregateBuysQueue } from './rewards/aggregate-buys-queue';
import { AggregateOrdersQueue } from './rewards/aggregate-orders-queue';
import { IngestOrderEventsQueue } from './rewards/ingest-order-events-queue';
import { OrderEventsTriggerQueue } from './rewards/orders-events-trigger-queue';
import { ProcessOrderEventsQueue } from './rewards/process-order-events-queue';
import { RewardEventsQueue } from './rewards/rewards-queue';
import { TriggerOrderRewardUpdateQueue } from './rewards/trigger-order-reward-update-queue';
import { UserRewardsEventsQueue } from './rewards/user-rewards-queue';
import { UserRewardsTriggerQueue } from './rewards/user-rewards-trigger-queue';
import { CollRef, DocRef } from '@/firestore/types';
import { SyncMetadata } from '@/lib/reservoir/order-events/types';

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
  const promises: Promise<unknown>[] = [];

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

  if (config.components.syncSales.enabled) {
    const initQueue = (chainId: string) => {
      const salesEventsQueue = new SalesEventsQueue(chainId, redis, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 1
      });
      return salesEventsQueue;
    };

    const salesQueues = config.supportedChains.map(initQueue);

    const trigger = async () => {
      for (const queue of salesQueues) {
        await queue.add({
          id: nanoid()
        });
      }
    };

    await trigger();
    cron.schedule('*/2 * * * *', async () => {
      await trigger();
    });
    promises.push(...salesQueues.map((item) => item.run()));
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
    promises.push(...eventProcessorsPromises);
  }

  if (config.components.ingestOrderEvents.enabled) {
    logger.log('ingest-order-events', `Starting order event ingestion!`);
    /**
     * fixes a bug where the type portion of the doc id had a leading space
     */
    const migrateSyncRefs = async () => {
      const syncs = db.collection('pixl').doc('orderCollections').collection('pixlOrderSyncs') as CollRef<SyncMetadata>;
      await db.runTransaction(async (txn) => {
        const snap = await txn.get(syncs);

        const migrations: { oldRef: DocRef<SyncMetadata>; newRef: DocRef<SyncMetadata>; data: SyncMetadata }[] = [];

        for (const doc of snap.docs) {
          const [chainId, type] = doc.id.split(':');
          if (type.startsWith(' ')) {
            const migratedDocRef = syncs.doc(`${chainId}:${type.trim()}`);
            const migratedDoc = await txn.get(migratedDocRef);
            if (!migratedDoc.exists) {
              migrations.push({
                oldRef: doc.ref,
                newRef: migratedDocRef,
                data: doc.data()
              });
            }
          }
        }

        for (const migration of migrations) {
          txn.create(migration.newRef, migration.data);
          txn.delete(migration.oldRef);
        }
      });
    };
    await migrateSyncRefs();

    const ingestOrderEventQueues: IngestOrderEventsQueue[] = [];
    for (const chainId of config.supportedChains) {
      for (const type of ['ask', 'bid'] as const) {
        const queue = new IngestOrderEventsQueue(`ingest-order-events`, chainId, type, redis, {
          enableMetrics: false,
          concurrency: 1,
          debug: true,
          attempts: 1
        });
        ingestOrderEventQueues.push(queue);
      }
    }

    const trigger = async () => {
      const ingestOrderEventPromises = ingestOrderEventQueues.map((queue) => {
        return queue.add({
          id: nanoid()
        });
      });

      await Promise.all(ingestOrderEventPromises);
    };

    cron.schedule('*/15 * * * * *', async () => {
      logger.log('ingest-order-events', `Triggering order event ingestion!`);
      await trigger();
    });
    await trigger();
    promises.push(...ingestOrderEventQueues.map((item) => item.run()));
  }
  if (config.components.rewards.enabled) {
    logger.log('rewards', `Starting rewards event processing!`);
    const rewardEventsQueue = new RewardEventsQueue('reward-events-queue', redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const aggregateBuysQueue = new AggregateBuysQueue('aggregate-buys-queue', redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const userRewardsQueue = new UserRewardsEventsQueue('user-rewards-events-queue', redis, {
      enableMetrics: false,
      concurrency: 8,
      debug: true,
      attempts: 1
    });

    const userRewardsTriggerQueue = new UserRewardsTriggerQueue('user-rewards-trigger-queue', redis, userRewardsQueue, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const orderEventsQueue = new ProcessOrderEventsQueue('process-order-events-queue', redis, {
      enableMetrics: false,
      concurrency: 10,
      debug: true,
      attempts: 1
    });

    const orderEventsTriggerQueue = new OrderEventsTriggerQueue('order-events-trigger-queue', orderEventsQueue, redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const aggregateOrdersQueue = new AggregateOrdersQueue('aggregate-orders-queue', redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const triggerOrderRewardUpdate = new TriggerOrderRewardUpdateQueue('trigger-order-reward-update-queue', redis, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });

    const trigger = async () => {
      const rewardEventsQueuePromise = rewardEventsQueue.add({
        id: nanoid()
      });
      const userRewardsTriggerQueuePromise = userRewardsTriggerQueue.add({
        id: nanoid()
      });
      const aggregateBuysPromise = aggregateBuysQueue.add({
        id: nanoid()
      });
      const aggregateOrdersPromise = aggregateOrdersQueue.add({
        id: nanoid()
      });
      const orderEventsTriggerPromise = orderEventsTriggerQueue.add({
        id: nanoid()
      });
      await Promise.allSettled([
        rewardEventsQueuePromise,
        userRewardsTriggerQueuePromise,
        aggregateBuysPromise,
        aggregateOrdersPromise,
        orderEventsTriggerPromise
      ]);
    };

    cron.schedule('*/15 * * * * *', async () => {
      logger.log('rewards', `Triggering rewards event processing!`);
      await trigger();
    });

    const triggerFiveMinQueue = async () => {
      const promises = [
        triggerOrderRewardUpdate.add({
          id: nanoid()
        })
      ];
      await Promise.all(promises);
    };

    cron.schedule('*/5 * * * *', async () => {
      logger.log('rewards', `Triggering order reward update!`);
      await triggerFiveMinQueue();
    });
    await trigger();
    await triggerFiveMinQueue();
    promises.push(
      rewardEventsQueue.run(),
      userRewardsTriggerQueue.run(),
      userRewardsQueue.run(),
      aggregateBuysQueue.run(),
      aggregateOrdersQueue.run(),
      orderEventsQueue.run(),
      orderEventsTriggerQueue.run(),
      triggerOrderRewardUpdate.run()
    );
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

  logger.log('process', `Starting ${promises.length} items`);
  await Promise.all(promises);
}
void main();
