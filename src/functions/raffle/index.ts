import {
  EntrantLedgerItem,
  PreMergeEntrantOrderLedgerItem,
  RaffleEntrant,
  RaffleTicketTotalsDoc,
  TransactionFeePhaseRewardsDoc,
  UserRaffle
} from '@infinityxyz/lib/types/core';
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
import { updateRaffleTicketTotals } from './update-raffle-ticket-totals';
import { addOrdersToRaffleLedgers } from './add-orders-to-raffle-ledgers';
import { aggregateRaffleRewardsLedger } from './aggregate-rewards-ledger';
import { aggregateEntrantsLedger } from './aggregate-entrants-ledger';

/**
 * users
 *  {userAddress}
 *    userRaffleOrdersLedger
 *      {eventId}
 *
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
 *                    {raffleTicketTotals} // contains the total number of tickets and unique users
 *                raffleTriggers
 *                    {rewardsLedgerTrigger} // triggers aggregation for the rewards ledger when a new event is added
 *                raffleRewardsLedger
 *                    {eventId} //
 */

/**
 * mark the trigger to aggregate the rewards
 */
export const triggerRaffleRewardsAggregation = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.RAFFLES_COLL}/{stakingContract}/${firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL}/{raffleId}/${firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL}/{eventId}`
  )
  .onCreate(async (change) => {
    const ref = change.ref;
    const raffleRef = ref.parent.parent as FirebaseFirestore.DocumentReference<UserRaffle>;
    if (!raffleRef) {
      throw new Error('raffle ref not found');
    }

    await updateLedgerTriggerToAggregate(raffleRef);
  });

export const aggregateRewardsLedger = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.RAFFLES_COLL}/{stakingContract}/${firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL}/{raffleId}/${firestoreConstants.RAFFLE_TRIGGERS_COLL}/${firestoreConstants.RAFFLE_LEDGER_TRIGGER_DOC}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as RaffleRewardsLedgerTriggerDoc;
    if (after?.requiresAggregation) {
      const rewardsLedgerTriggerRef = change.after
        .ref as FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>;
      const rewardsLedgerRef = rewardsLedgerTriggerRef.parent.parent?.collection(
        firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL
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
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();

    const maxAge = ONE_MIN * 5;
    const raffleRewardsLedgers = db.collectionGroup(
      firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL
    ) as FirebaseFirestore.CollectionGroup<RaffleLedgerSale>;
    const unaggregatedRewardsLedgers = raffleRewardsLedgers
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(unaggregatedRewardsLedgers, (_, ref) => [ref], { pageSize: 300 });

    const paths = new Set<string>();
    const batch = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      const raffleRef = ref.parent.parent as FirebaseFirestore.DocumentReference<UserRaffle>;
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

export const onEntrantLedgerEvent = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.RAFFLES_COLL}/{stakingContract}/${firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL}/{raffleId}/${firestoreConstants.RAFFLE_ENTRANTS_COLL}/{entrantId}/${firestoreConstants.RAFFLE_ENTRANTS_LEDGER_COLL}/{eventId}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as EntrantLedgerItem;
    if (after && !after.isAggregated) {
      await change.after.ref.parent.parent?.set({ isLedgerAggregated: false, updatedAt: Date.now() }, { merge: true });
    }
  });

export const onEntrantLedgerEventBackup = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = ONE_MIN * 5;
    const unaggregatedLedgerEvents = db
      .collectionGroup(firestoreConstants.RAFFLE_ENTRANTS_LEDGER_COLL)
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(unaggregatedLedgerEvents, (_, ref) => [ref], { pageSize: 300 });

    const batchHandler = new FirestoreBatchHandler();
    const paths = new Set<string>();
    for await (const { ref } of stream) {
      const entrantRef = ref.parent.parent;
      if (entrantRef && !paths.has(entrantRef.path)) {
        paths.add(entrantRef.path);
        await batchHandler.addAsync(entrantRef, { isLedgerAggregated: false, updatedAt: Date.now() }, { merge: true });
      }
    }
    await batchHandler.flush();
  });

export const onEntrantWrite = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.RAFFLES_COLL}/{stakingContract}/${firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL}/{raffleId}/${firestoreConstants.RAFFLE_ENTRANTS_COLL}/{entrantId}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as Partial<RaffleEntrant>;
    if (!after) {
      return;
    }

    if (!after.isLedgerAggregated) {
      await aggregateEntrantsLedger(change.after.ref as FirebaseFirestore.DocumentReference<RaffleEntrant>);
    } else if (!after.isAggregated) {
      await change.after.ref.parent.parent
        ?.collection(firestoreConstants.RAFFLE_TOTALS_COLL)
        .doc(firestoreConstants.RAFFLE_TICKET_TOTALS_DOC)
        .set({ isAggregated: false, updatedAt: Date.now() }, { merge: true });
    }
  });

export const updateTicketTotals = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.RAFFLES_COLL}/{stakingContract}/${firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL}/{raffleId}/${firestoreConstants.RAFFLE_TOTALS_COLL}/${firestoreConstants.RAFFLE_TICKET_TOTALS_DOC}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as Partial<RaffleTicketTotalsDoc>;

    if (!after || after.isAggregated) {
      return;
    }

    const minAge = ONE_MIN * 5;
    if (!after.totalsUpdatedAt || after.totalsUpdatedAt < Date.now() - minAge) {
      await updateRaffleTicketTotals(change.after.ref.parent.parent as FirebaseFirestore.DocumentReference<UserRaffle>);
    }
  });

export const updateTicketTotalsBackup = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = ONE_MIN * 10;
    const unaggregatedTriggers = db
      .collectionGroup(firestoreConstants.RAFFLE_TOTALS_COLL)
      .where('isAggregated', '==', false)
      .where('totalsUpdatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(unaggregatedTriggers, (_, ref) => [ref], { pageSize: 300 });

    const batchHandler = new FirestoreBatchHandler();
    const paths = new Set<string>();
    for await (const { ref } of stream) {
      if (!paths.has(ref.path)) {
        paths.add(ref.path);
        await batchHandler.addAsync(ref, { updatedAt: Date.now() }, { merge: true });
      }
    }

    await batchHandler.flush();
  });

export const applyOrdersToRaffleLedgers = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.USERS_COLL}/{userId}/${firestoreConstants.USER_RAFFLE_ORDERS_LEDGER_COLL}/{orderId}`
  )
  .onWrite(async (change) => {
    const item = change.after.data() as PreMergeEntrantOrderLedgerItem;

    if (!item || item.isAggregated) {
      return;
    }
    const db = change.after.ref.firestore;

    await addOrdersToRaffleLedgers(
      item,
      change.after.ref as FirebaseFirestore.DocumentReference<PreMergeEntrantOrderLedgerItem>,
      db
    );
  });

export const applyOrdersToRaffleLedgersBackup = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = ONE_MIN * 10;
    const unaggregatedOrders = db
      .collectionGroup(firestoreConstants.USER_RAFFLE_ORDERS_LEDGER_COLL)
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge);
    const stream = streamQueryWithRef(unaggregatedOrders, (_, ref) => [ref], { pageSize: 300 });
    const batchHandler = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      await batchHandler.addAsync(ref, { updatedAt: Date.now() }, { merge: true });
    }

    await batchHandler.flush();
  });
