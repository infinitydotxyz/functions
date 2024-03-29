import * as functions from 'firebase-functions';

import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { RewardsEventMerger } from './rewards-event-merger';
import { RewardsEventProcessor } from './rewards-event-processor';

const rewardsEventMerger = new RewardsEventMerger(
  {
    docBuilderCollectionPath: `${firestoreConstants.REWARDS_COLL}/{chainId}/rewardsLedger`,
    batchSize: 300,
    maxPages: 3,
    minTriggerInterval: ONE_MIN,
    id: 'merger'
  },
  {
    schedule: 'every 5 minutes',
    tts: ONE_MIN
  },
  getDb
);

const rewardsEventProcessor = new RewardsEventProcessor(
  {
    docBuilderCollectionPath: `${firestoreConstants.REWARDS_COLL}/{chainId}/rewardsLedger`,
    batchSize: 30,
    maxPages: 30,
    minTriggerInterval: ONE_MIN,
    id: 'processor'
  },
  {
    schedule: 'every 5 minutes',
    tts: ONE_MIN
  },
  getDb
);

const merger = rewardsEventMerger.getFunctions();
const processor = rewardsEventProcessor.getFunctions();

const settings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 540
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

/**
 * merging
 */
export const onMergeRewardsEvent = merger.onEvent(documentBuilder);
export const onMergeRewardsEventBackup = merger.scheduledBackupEvents(scheduleBuilder);
export const onMergeEventProcess = merger.process(documentBuilder);
export const onMergeEventProcessBackup = merger.scheduledBackupTrigger(scheduleBuilder);

/**
 * processing
 */
export const onProcessRewardsEvent = processor.onEvent(documentBuilder);
export const onProcessRewardsEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessEventProcess = processor.process(documentBuilder);
export const onProcessEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
