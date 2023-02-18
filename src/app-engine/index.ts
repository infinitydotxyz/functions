import cron from 'node-cron';

import { ChainId } from '@infinityxyz/lib/types/core';
import { getExchangeAddress } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';
import { AbstractProcess } from '@/lib/process/process.abstract';

import { config } from '../config';
import { Reservoir } from '../lib';
import { BlockScheduler } from './on-chain-events/block-scheduler';
import { FlowExchange } from './on-chain-events/flow-exchange/flow-exchange';
import { OrderEventsQueue, OrderJobData, OrderJobResult } from './order-events/order-events-queue';
import { JobData, QueueOfQueues } from './queue-of-queues';
import { redis } from './redis';
import { SalesEventsQueue, SalesJobData, SalesJobResult } from './reservoir-sales-events/sales-events-queue';

async function main() {
  const db = getDb();
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  const promises = [];

  if (config.syncs.processOrders) {
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

  if (config.syncs.processSales) {
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

  if (config.syncs.processOnChainEvents) {
    const chainId = ChainId.Mainnet;
    const address = getExchangeAddress(chainId);
    const startBlockNumber = 16471202;
    const blockProcessor = new FlowExchange(redis, chainId, address, startBlockNumber, db, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 5
    });
    const blockScheduler = new BlockScheduler(redis, chainId, [blockProcessor], {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });
    const trigger = async () => {
      const provider = config.providers[chainId];
      if (!provider) {
        logger.error('on-chain-events-trigger', `No provider found for chainId ${chainId}`);
        return;
      }
      await blockScheduler.add({
        id: chainId,
        chainId,
        httpsProviderUrl: provider.connection.url,
        wsProviderUrl: provider.connection.url.replace('https', 'wss')
      });
    };

    await trigger();
    cron.schedule('*/2 * * * *', async () => {
      await trigger();
    });
    promises.push(blockScheduler.run(), blockProcessor.run());
  }

  await Promise.all(promises);
}

void main();
