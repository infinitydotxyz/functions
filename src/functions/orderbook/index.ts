import * as functions from 'firebase-functions';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { OrderEventProcessor } from './order-event-processor';
import { takeSnapshot } from './snapshot';
import { TokenOrdersProcessor } from './token-orders-processor';

/**
 * order event processor
 */
const orderEventProcessor = new OrderEventProcessor(
  {
    docBuilderCollectionPath: `ordersV2/{orderId}/orderEvents`,
    batchSize: 200,
    maxPages: 3,
    minTriggerInterval: ONE_MIN,
    id: 'processor',
    isCollectionGroup: true
  },
  {
    schedule: 'every 2 minutes',
    tts: ONE_MIN
  },
  getDb,
  true
);

const processor = orderEventProcessor.getFunctions();

const settings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 540
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

export const onProcessOrderEvent = processor.onEvent(documentBuilder);
export const onProcessOrderEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessOrderEventProcess = processor.process(documentBuilder);
export const onProcessOrderEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);

/**
 * scheduled orderbook snapshots
 */
export const takeOrderbookSnapshots = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    const db = getDb();
    const date = new Date().toISOString().split('T')[0];
    const fileName = (chainId: ChainId) => {
      return `chain:${chainId}:date:${date}`;
    };
    const bucketName = config.firebase.snapshotBucket;
    const mainnet = takeSnapshot(db, ChainId.Mainnet, bucketName, fileName(ChainId.Mainnet));
    const goerli = takeSnapshot(db, ChainId.Goerli, bucketName, fileName(ChainId.Goerli));
    const start = Date.now();
    await Promise.allSettled([mainnet, goerli]);

    const end = Date.now();

    if (end - start > ONE_MIN * 3) {
      console.error('Snapshots are taking a significant amount of time to complete. Consider alternative triggers');
    }
  });

/**
 * token orders processor
 */
const tokenOrdersProcessor = new TokenOrdersProcessor(
  {
    docBuilderCollectionPath: `collections/{collectionId}/nfts/{tokenId}/tokenV2Orders`,
    batchSize: 400,
    maxPages: 3,
    minTriggerInterval: ONE_MIN,
    id: 'processor',
    isCollectionGroup: true
  },
  {
    schedule: 'every 2 minutes',
    tts: ONE_MIN
  },
  getDb,
  true
);

const tokenOrdersProcessorFunctions = tokenOrdersProcessor.getFunctions();
export const onProcessTokenOrders = tokenOrdersProcessorFunctions.onEvent(documentBuilder);
export const onProcessTokenOrdersBackup = tokenOrdersProcessorFunctions.scheduledBackupEvents(scheduleBuilder);
export const onProcessTokenOrdersProcess = tokenOrdersProcessorFunctions.process(documentBuilder);
export const onProcessTokenOrdersProcessBackup = tokenOrdersProcessorFunctions.scheduledBackupTrigger(scheduleBuilder);
