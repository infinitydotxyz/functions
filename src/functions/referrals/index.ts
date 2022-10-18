import * as functions from 'firebase-functions';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { streamQueryWithRef } from '../../firestore/stream-query';

/**
 * 1. merge referral sale events
 * 2. aggregate merged referral sale events
 *
 *
 * update merkle root calculations
 * update rewards endpoint
 *
 * fe:
 * refactor rewards to have eth + INFT sections split by referrals, curation, etc
 */

/**
 *
 * user
 *  {userAddress}
 *      referrals
 *          {chainId} // aggregated referral data
 *              assetReferrals // maintains the referrals for collections/tokens for the user
 *              referralsLedger // ledger of referral events
 */

