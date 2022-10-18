import { ONE_MIN } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { ReferralsEventProcessor } from './referrals-event-processor';

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
    docBuilderCollectionPath: 'user/{userAddress}/referrals/{chainId}/referralsLedger',
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

const functions = referralsEventProcessor.getFunctions();
export const onReferrerEvent = functions.onEvent;
export const onReferrerEventBackup = functions.scheduledBackup;
export const onReferrerEventProcess = functions.process;
