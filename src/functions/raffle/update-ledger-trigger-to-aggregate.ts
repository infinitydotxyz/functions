import { ONE_MIN } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { RaffleRewardsLedgerTriggerDoc, UserRaffle } from './types';

export async function updateLedgerTriggerToAggregate(
  raffleRef: FirebaseFirestore.DocumentReference<UserRaffle>,
  batch?: FirestoreBatchHandler,
  minAge = ONE_MIN * 5
) {
  const rewardsLedgerTriggerRef = raffleRef
    .collection('raffleTriggers')
    .doc('rewardsLedgerTrigger') as FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>;

  const ledgerTriggerSnap = await rewardsLedgerTriggerRef.get();
  const update: RaffleRewardsLedgerTriggerDoc = {
    requiresAggregation: true,
    updatedAt: Date.now()
  };
  
  const ledgerTrigger: Partial<RaffleRewardsLedgerTriggerDoc> = ledgerTriggerSnap.data() ?? {};
  const expired = typeof ledgerTrigger.updatedAt === 'number' && ledgerTrigger.updatedAt <= Date.now() - minAge
  if (!ledgerTrigger?.requiresAggregation || expired) {
    if (batch) {
      await batch.addAsync(rewardsLedgerTriggerRef, update, { merge: true });
    } else {
      await rewardsLedgerTriggerRef.set(update, { merge: true });
    }
  }
}
