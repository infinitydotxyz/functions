import { ONE_MIN } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { RaffleLedgerSale } from '../../rewards/trading-fee-program-handlers/raffle-handler';
import { REGION } from '../../utils/constants';
import { RaffleRewardsLedgerTriggerDoc } from './aggregate-rewards-ledger';
import { updateLedgerTriggerToAggregate } from './update-ledger-trigger-to-aggregate';

/**
 * NEW
 * raffles
 *   {stakerChainId:stakerContractAddress}
 *       stakingContractRaffles
 *           {raffleId} // { type: userRaffle | collectionRaffle, chainId, state, raffleContractAddress, raffleContractChainId, isActive, id, complication: { stakerContractAddress, stakerContractChainId, phase }, winners?: [{address, prize, winningTicketNumber, } ] }
 *               raffleEntrants
 *                   {ticket holder address} // collection or user - stores if aggregated or not
 *                       raffleEntrantLedger
 *                           {ledgerEvent} // raffle => listings, offers, sales. collection => { userAddress, vote: 1, stakeLevel, blockNumber }
 *                raffleTotals
 *                    {raffleRewards} // can be used to track progress of the raffle rewards in real time
 *                    {raffleTicketTotals} // contains the total number of tickets and total number of unique users involved
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
