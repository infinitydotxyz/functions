import * as functions from 'firebase-functions';
import { firestoreConstants, ONE_MIN } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { RewardsEventMerger } from './rewards-event-merger';
import { REGION } from '../../utils/constants';

const rewardsEventMerger = new RewardsEventMerger(
  {
    docBuilderCollectionPath: `${firestoreConstants.REWARDS_COLL}/{chainId}/rewardsLedger/{eventId}`,
    batchSize: 300,
    maxPages: 3,
    minTriggerInterval: ONE_MIN
  },
  {
    schedule: 'every 5 minutes',
    tts: ONE_MIN
  },
  getDb
);

const fns = rewardsEventMerger.getFunctions();

const settings = functions.region(REGION).runWith({
  timeoutSeconds: 540
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

export const onMergeRewardsEvent = fns.onEvent(documentBuilder);
export const onMergeRewardsEventBackup = fns.scheduledBackupEvents(scheduleBuilder);
export const onMergeEventProcess = fns.process(documentBuilder);
export const onMergeEventProcessBackup = fns.scheduledBackupTrigger(scheduleBuilder);
