import FirestoreBatchHandler from '../../firestore/batch-handler';
import { RaffleRewardsLedgerTriggerDoc } from './aggregate-rewards-ledger';

export async function updateLedgerTriggerToAggregate(
  raffleRef: FirebaseFirestore.DocumentReference,
  batch?: FirestoreBatchHandler
) {
  const rewardsLedgerTriggerRef = raffleRef
    .collection('raffleTriggers')
    .doc('rewardsLedgerTrigger') as FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>;

  const ledgerTriggerSnap = await rewardsLedgerTriggerRef.get();
  if (!ledgerTriggerSnap.data()?.requiresAggregation) {
    if (batch) {
      await batch.addAsync(
        rewardsLedgerTriggerRef,
        {
          requiresAggregation: true,
          updatedAt: Date.now()
        },
        { merge: true }
      );
    } else {
      await rewardsLedgerTriggerRef.set(
        {
          requiresAggregation: true,
          updatedAt: Date.now()
        },
        { merge: true }
      );
    }
  }
}
