import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { OrderEventProcessor } from './order-event-processor';

const orderEventProcessor = new OrderEventProcessor(
  {
    docBuilderCollectionPath: `ordersV2/{orderId}/orderEvents`,
    batchSize: 200,
    maxPages: 3,
    minTriggerInterval: ONE_MIN,
    id: 'processor'
  },
  {
    schedule: 'every 2 minutes',
    tts: ONE_MIN
  },
  getDb
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
