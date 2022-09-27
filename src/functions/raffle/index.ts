import { TransactionFeePhaseRewardsDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants, ONE_MIN } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { RaffleLedgerSale } from '../../rewards/trading-fee-program-handlers/raffle-handler';
import { REGION } from '../../utils/constants';
import { saveTxnFees } from './save-txn-fees';
import { RaffleRewardsLedgerTriggerDoc } from './types';
import { updateLedgerTriggerToAggregate } from './update-ledger-trigger-to-aggregate';

/**
 * raffles
 *   {stakerChainId:stakerContractAddress}
 *       stakingContractRaffles
 *           {raffleId} // { type: userRaffle | collectionRaffle, chainId, state, raffleContractAddress, raffleContractChainId, id, complication: { stakerContractAddress, stakerContractChainId, phase }, winners?: [{address, prize, winningTicketNumber, } ] }
 *                raffleEntrants
 *                   {ticket holder address} // collection or user - stores if aggregated or not
 *                       raffleEntrantLedger
 *                           {ledgerEvent} // raffle => listings, offers, phase rewards
 *                raffleTotals
 *                    {raffleRewards} // can be used to track progress of the raffle rewards in real time
 *                    {raffleTicketTotals} // contains the total number of tickets and total number of unique users involved
 *                raffleTriggers
 *                    {rewardsLedgerTrigger} // triggers aggregation for the rewards ledger when a new event is added
 *                raffleRewardsLedger
 *                    {eventId} //
 */

// TODO initialize raffles for staker contracts and backfill events?

/**
 * mark the trigger to aggregate the rewards
 */
export const triggerRaffleRewardsAggregation = functions
  .region(REGION)
  .firestore.document('raffles/{stakingContract}/stakingContractRaffles/{raffleId}/raffleRewardsLedger/{eventId}')
  .onCreate(async (change) => {
    const ref = change.ref;
    const raffleRef = ref.parent.parent;
    if (!raffleRef) {
      throw new Error('raffle ref not found');
    }

    await updateLedgerTriggerToAggregate(raffleRef);
  });

export const aggregateRaffleRewardsLedger = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document('raffles/{stakingContract}/stakingContractRaffles/{raffleId}/raffleTriggers/rewardsLedgerTrigger')
  .onWrite(async (change) => {
    const after = change.after.data() as RaffleRewardsLedgerTriggerDoc;
    if (after?.requiresAggregation) {
      const rewardsLedgerTriggerRef = change.after
        .ref as FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>;
      const rewardsLedgerRef = rewardsLedgerTriggerRef.parent.parent?.collection(
        'raffleRewardsLedger'
      ) as FirebaseFirestore.CollectionReference<RaffleLedgerSale>;

      if (!rewardsLedgerRef) {
        throw new Error('rewards ledger ref not found');
      }

      await aggregateRaffleRewardsLedger(rewardsLedgerRef, rewardsLedgerTriggerRef);
    }
  });

/**
 * query for missed rewards and mark the trigger to aggregate the rewards
 */
export const triggerRaffleRewardsAggregationBackup = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    const db = getDb();

    const maxAge = ONE_MIN * 15;
    const raffleRewardsLedgers = db.collectionGroup(
      'raffleRewardsLedger'
    ) as FirebaseFirestore.CollectionGroup<RaffleLedgerSale>;
    const unaggregatedRewardsLedgers = raffleRewardsLedgers
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(unaggregatedRewardsLedgers, (_, ref) => [ref], { pageSize: 300 });

    const paths = new Set<string>();
    const batch = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      const raffleRef = ref.parent.parent;
      if (!raffleRef) {
        continue;
      } else if (!paths.has(raffleRef.path)) {
        paths.add(raffleRef.path);
        await updateLedgerTriggerToAggregate(raffleRef, batch);
      }
    }

    await batch.flush();
  });

export const copyTxnFeeRewardsToRaffleEntrants = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.USERS_COLL}/{user}/${firestoreConstants.USER_REWARDS_COLL}/{chainId}/${firestoreConstants.USER_REWARD_PHASES_COLL}/{phase}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as TransactionFeePhaseRewardsDoc;

    if (!after) {
      return;
    }

    if (!after.isCopiedToRaffles) {
      await saveTxnFees(
        change.after.ref.firestore,
        change.after.ref as FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>
      );
    }
  });

export const copyTxnFeeRewardsToRaffleEntrantsBackup = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = 5 * ONE_MIN;
    const phaseUserTxnFeeRewardsQuery = db
      .collectionGroup(firestoreConstants.USER_REWARD_PHASES_COLL)
      .where('isCopiedToRaffles', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge) as FirebaseFirestore.Query<TransactionFeePhaseRewardsDoc>;
    const phaseStream = streamQueryWithRef(phaseUserTxnFeeRewardsQuery, (_, ref) => [ref], { pageSize: 300 });

    const batchHandler = new FirestoreBatchHandler();

    // trigger function to copy docs to raffle entrants
    for await (const { ref } of phaseStream) {
      await batchHandler.addAsync(ref, { updatedAt: Date.now() }, { merge: true });
    }

    await batchHandler.flush();
  });
