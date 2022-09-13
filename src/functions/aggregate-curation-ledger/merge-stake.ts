import { StakerEvents } from '@infinityxyz/lib/types/core';
import {
  CurationLedgerEvent,
  CurationLedgerEvents,
  CurationLedgerEventStake,
  CurationLedgerVotesAddedWithStake,
  CurationLedgerVotesRemovedWithStake
} from '@infinityxyz/lib/types/core/curation-ledger/curation-ledger-events';
import { firestoreConstants } from '@infinityxyz/lib/utils';

export async function mergeStake(curationLedgerEventRef: FirebaseFirestore.DocumentReference<CurationLedgerEvents>) {
  const db = curationLedgerEventRef.firestore;
  await db.runTransaction(async (txn) => {
    const curationLedgerEventSnap = await txn.get(curationLedgerEventRef);
    const curationLedgerEvent = curationLedgerEventSnap.data() as CurationLedgerEvents;
    if (curationLedgerEvent.isStakeMerged === false) {
      const stakerContractId = curationLedgerEventRef.parent.parent?.id;
      if (!stakerContractId) {
        throw new Error('stakerContractId not found');
      }
      const stakingLedgerRef = db
        .collection(firestoreConstants.STAKING_CONTRACTS_COLL)
        .doc(stakerContractId)
        .collection(firestoreConstants.STAKING_LEDGER_COLL);
      const query = stakingLedgerRef
        .where('blockNumber', '<=', curationLedgerEvent.blockNumber)
        .orderBy('blockNumber', 'desc')
        .limit(1);
      const snapshot = await txn.get(query);
      const doc = snapshot.docs?.[0];
      if (doc) {
        const stakerEvent = doc.data() as StakerEvents;
        const stake: CurationLedgerEventStake = {
          stakeInfo: stakerEvent.stakeInfo,
          stakePower: stakerEvent.stakePower,
          stakePowerPerToken: stakerEvent.stakePowerPerToken,
          stakerEventTxHash: stakerEvent.txHash,
          stakerEventBlockNumber: stakerEvent.blockNumber
        };
        if (curationLedgerEvent.discriminator === CurationLedgerEvent.VotesAdded) {
          const updatedEvent: CurationLedgerVotesAddedWithStake = {
            ...curationLedgerEvent,
            stake,
            isStakeMerged: true
          };
          txn.set(curationLedgerEventRef, updatedEvent);
        } else if (curationLedgerEvent.discriminator === CurationLedgerEvent.VotesRemoved) {
          const updatedEvent: CurationLedgerVotesRemovedWithStake = {
            ...curationLedgerEvent,
            stake,
            isStakeMerged: true
          };
          txn.set(curationLedgerEventRef, updatedEvent);
        } else {
          throw new Error(`Unsupported event type: ${(curationLedgerEvent as any).discriminator}`);
        }
      }
    }
  });
}
