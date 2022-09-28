import FirestoreBatchHandler from '../../firestore/batch-handler';
import { RaffleRewardsLedgerTriggerDoc } from './types';

export async function updateLedgerTriggerToAggregate(
  raffleRef: FirebaseFirestore.DocumentReference,
  batch?: FirestoreBatchHandler
) {
  const rewardsLedgerTriggerRef = raffleRef
    .collection('raffleTriggers')
    .doc('rewardsLedgerTrigger') as FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>;

  const ledgerTriggerSnap = await rewardsLedgerTriggerRef.get();
  const update: RaffleRewardsLedgerTriggerDoc = {
    requiresAggregation: true,
    updatedAt: Date.now()
  };
  if (!ledgerTriggerSnap.data()?.requiresAggregation) {
    if (batch) {
      await batch.addAsync(rewardsLedgerTriggerRef, update, { merge: true });
    } else {
      await rewardsLedgerTriggerRef.set(update, { merge: true });
    }
  }
}
