import { ChainId, TransactionFeePhaseRewardsDoc } from '@infinityxyz/lib/types/core';
import { getRelevantStakerContracts } from '../aggregate-sales-stats/utils';
import { EntrantFeesLedgerItem, EntrantLedgerItemVariant, StakingContractRaffle } from './types';

export async function saveTxnFees(
  db: FirebaseFirestore.Firestore,
  txnFeeRewardsRef: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>
) {
  await db.runTransaction(async (txn) => {
    const snapshot = await txn.get(txnFeeRewardsRef);
    const data = snapshot.data();
    if (!data) {
      throw new Error('Invalid Txn Fee Rewards Doc');
    }

    if (data.isCopiedToRaffles) {
      throw new Error('Txn Fee Rewards Doc already copied to raffles');
    }

    const applicableRaffles = await getApplicableRaffles(db, data.chainId, data.phaseId);
    const ledgerItem = getEntrantFeesLedgerItem(data);
    for (const raffle of applicableRaffles) {
      const entrantPhaseDocRef = raffle.ref
        .collection('raffleEntrants')
        .doc(data.userAddress)
        .collection('raffleEntrantLedger')
        .doc(`phase:${data.phaseId}`);
      txn.set(entrantPhaseDocRef, ledgerItem, { merge: false });
    }
  });
}

async function getApplicableRaffles(db: FirebaseFirestore.Firestore, chainId: ChainId, phaseId: string) {
  const stakerContracts = getRelevantStakerContracts(chainId);
  const applicableRafflesQueries: FirebaseFirestore.Query<StakingContractRaffle>[] = [];
  for (const stakerContract of stakerContracts) {
    const rafflesRef = db.collection('raffles').doc(`${chainId}:${stakerContract}`);
    const stakerContractRaffles = rafflesRef
      .collection('stakingContractRaffles')
      .where('activePhaseIds', 'array-contains', phaseId) as FirebaseFirestore.Query<StakingContractRaffle>;
    applicableRafflesQueries.push(stakerContractRaffles);
  }
  const results = await Promise.all(applicableRafflesQueries.map((query) => query.get()));
  return results.flatMap((item) => item.docs);
}

function getEntrantFeesLedgerItem(txnFees: TransactionFeePhaseRewardsDoc): EntrantFeesLedgerItem {
  return {
    phaseId: txnFees.phaseId,
    phaseName: txnFees.phaseName,
    phaseIndex: txnFees.phaseIndex,
    chainId: txnFees.chainId,
    userAddress: txnFees.userAddress,
    volumeEth: txnFees.volumeEth,
    volumeUSDC: txnFees.volumeUSDC,
    volumeWei: txnFees.volumeWei,
    updatedAt: Date.now(),
    userSells: txnFees.userSells,
    userBuys: txnFees.userBuys,
    protocolFeesWei: txnFees.protocolFeesWei,
    protocolFeesEth: txnFees.protocolFeesEth,
    protocolFeesUSDC: txnFees.protocolFeesUSDC,
    isAggregated: false,
    discriminator: EntrantLedgerItemVariant.TransactionStats
  };
}
