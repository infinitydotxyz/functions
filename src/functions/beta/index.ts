import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { ReferralsProcessor } from './referrals-processor';

const referralsProcessor = new ReferralsProcessor(
  {
    docBuilderCollectionPath: `flowBetaReferralCodes/{referralCode}/flowBetaUserReferrals`,
    batchSize: 300,
    maxPages: 5,
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

const processor = referralsProcessor.getFunctions();

const documentSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 60
});

const scheduleSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 5 * 60 - 5,
  maxInstances: 1
});

const documentBuilder = documentSettings.firestore.document;
const scheduleBuilder = scheduleSettings.pubsub.schedule;

export const onProcessBetaReferralEvent = processor.onEvent(documentBuilder);
export const onProcessBetaReferralEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessBetaReferralEventProcess = processor.process(documentBuilder);
export const onProcessBetaReferralEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
