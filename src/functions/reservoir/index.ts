import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { ReservoirOrderStatusEventProcessor } from './reservoir-order-event-processor';
import { syncOrderEvents } from './sync-order-events';

// import { syncSaleEvents } from './sync-sale-events';

export const syncOrderStatusEvents = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 530, maxInstances: 1 })
  .pubsub.schedule('every 9 minutes')
  .onRun(async () => {
    const db = getDb();
    const stopIn = 530 * 1000;
    await syncOrderEvents(db, stopIn, { pollInterval: 10_000, delay: 0 });
  });

// export const syncSaleEventsToPG = functions
//   .region(config.firebase.region)
//   .runWith({ timeoutSeconds: 530, maxInstances: 1 })
//   .pubsub.schedule('every 9 minutes')
//   .onRun(async () => {
//     const db = getDb();
//     const stopIn = 530 * 1000;
//     await syncSaleEvents(db, stopIn, { pollInterval: 10_000, delay: 0 });
//   });

const reservoirOrderEventProcessor = new ReservoirOrderStatusEventProcessor(
  {
    docBuilderCollectionPath: `ordersV2/{orderId}/reservoirOrderEvents`,
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

const processor = reservoirOrderEventProcessor.getFunctions();

const documentSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 60,
  maxInstances: 500
});

const scheduleSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 110,
  maxInstances: 1
});

const documentBuilder = documentSettings.firestore.document;
const scheduleBuilder = scheduleSettings.pubsub.schedule;

export const onProcessReservoirOrderStatusEvent = processor.onEvent(documentBuilder);
export const onProcessReservoirOrderStatusEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessReservoirOrderStatusEventProcess = processor.process(documentBuilder);
export const onProcessReservoirOrderStatusEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
