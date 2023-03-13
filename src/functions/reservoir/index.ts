import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { ReservoirOrderStatusEventProcessor } from './reservoir-order-event-processor';

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
    tts: 2 * ONE_MIN
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

const vpc = config.pg.vpcConnector
  ? {
      vpcConnector: config.pg.vpcConnector,
      vpcConnectorEgressSettings: 'PRIVATE_RANGES_ONLY'
    }
  : {};
const processDocumentSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 60,
  maxInstances: 500,
  minInstances: 1,
  ...(vpc as {
    vpcConnector: string;
    vpcConnectorEgressSettings: functions.RuntimeOptions['vpcConnectorEgressSettings'];
  })
}).firestore.document;
export const onProcessReservoirOrderStatusEventProcess = processor.process(processDocumentSettings);
export const onProcessReservoirOrderStatusEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
