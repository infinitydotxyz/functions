import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { ReservoirOrderStatusEventProcessor } from './reservoir-order-event-processor';
import { syncOrderEvents } from './sync-order-events';

export const syncOrderStatusEvents = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 9 minutes')
  .onRun(async () => {
    const db = getDb();
    const stopIn = ONE_MIN * 8.75;
    await syncOrderEvents(db, stopIn, { pollInterval: 30_000, delay: 10_000 });
  });

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
  getDb
);

const processor = reservoirOrderEventProcessor.getFunctions();

const settings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 540
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

export const onProcessReservoirOrderStatusEvent = processor.onEvent(documentBuilder);
export const onProcessReservoirOrderStatusEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessReservoirOrderStatusEventProcess = processor.process(documentBuilder);
export const onProcessReservoirOrderStatusEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
