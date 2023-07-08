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

const documentSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 60,
  maxInstances: 5_000
});

const scheduleSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 2 * 60 - 5,
  maxInstances: 1
});

const documentBuilder = documentSettings.firestore.document;
const scheduleBuilder = scheduleSettings.pubsub.schedule;

export const onProcessOrderEvent = processor.onEvent(documentBuilder);
export const onProcessOrderEventBackup = processor.scheduledBackupEvents(scheduleBuilder);

export const onProcessOrderEventProcess = processor.process(
  functions.region(config.firebase.region).runWith({
    timeoutSeconds: 60,
    maxInstances: 5_000,
    minInstances: 1
  }).firestore.document
);
export const onProcessOrderEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);

/**
 * scheduled orderbook snapshots
 */
export const takeOrderbookSnapshots = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    const mainnet = takeSnapshot(ChainId.Mainnet);
    const goerli = takeSnapshot(ChainId.Goerli);
    await Promise.allSettled([mainnet, goerli]);
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
    schedule: 'every 5 minutes',
    tts: 5 * ONE_MIN
  },
  getDb,
  true
);

const tokenOrdersProcessorFunctions = tokenOrdersProcessor.getFunctions();

export const onProcessTokenOrders = tokenOrdersProcessorFunctions.onEvent(documentBuilder);
export const onProcessTokenOrdersBackup = tokenOrdersProcessorFunctions.scheduledBackupEvents(scheduleBuilder);
export const onProcessTokenOrdersProcess = tokenOrdersProcessorFunctions.process(
  functions.region(config.firebase.region).runWith({
    timeoutSeconds: 60,
    maxInstances: 5_000,
    minInstances: 1
  }).firestore.document
);
export const onProcessTokenOrdersProcessBackup = tokenOrdersProcessorFunctions.scheduledBackupTrigger(scheduleBuilder);
