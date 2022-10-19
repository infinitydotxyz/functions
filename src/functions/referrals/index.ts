import * as functions from 'firebase-functions';
import { firestoreConstants, ONE_MIN } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { ReferralsEventProcessor } from './referrals-event-processor';
import { REGION } from '../../utils/constants';

/**
 * user
 *  {userAddress}
 *      referrals
 *          {chainId} // aggregated referral data
 *              assetReferrals // maintains the referrals for collections/tokens for the user
 *              referralsLedger // ledger of referral events
 */

const referralsEventProcessor = new ReferralsEventProcessor(
  {
    docBuilderCollectionPath: `${firestoreConstants.USERS_COLL}/{userAddress}/${firestoreConstants.REFERRALS_COLL}/{chainId}/${firestoreConstants.REFERRALS_LEDGER}`,
    batchSize: 300,
    maxPages: 2,
    minTriggerInterval: ONE_MIN
  },
  {
    schedule: 'every 5 minutes',
    tts: ONE_MIN
  },
  getDb
);

const fns = referralsEventProcessor.getFunctions();
const settings = functions.region(REGION).runWith({
  timeoutSeconds: 540
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

export const onReferrerEvent = fns.onEvent(documentBuilder);
export const onReferrerEventBackup = fns.scheduledBackupEvents(scheduleBuilder);
export const onReferrerEventProcess = fns.process(documentBuilder);
export const onReferrerEventProcessBackup = fns.scheduledBackupTrigger(scheduleBuilder);
