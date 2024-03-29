import {
  ChainId,
  EntrantFeesLedgerItem,
  EntrantLedgerItemVariant,
  StakingContractRaffle,
  TransactionFeePhaseRewardsDoc
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, getRelevantStakerContracts } from '@infinityxyz/lib/utils';

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
    for (const raffle of applicableRaffles) {
      const raffleData = raffle.data();
      const ledgerItem = getEntrantFeesLedgerItem(
        data,
        raffleData.stakerContractAddress,
        raffleData.stakerContractChainId
      );
      raffleData.stakerContractAddress;
      const entrantPhaseDocRef = raffle.ref
        .collection(firestoreConstants.RAFFLE_ENTRANTS_COLL)
        .doc(data.userAddress)
        .collection(firestoreConstants.RAFFLE_ENTRANTS_LEDGER_COLL)
        .doc(`phase:${data.phaseId}`);

      txn.set(entrantPhaseDocRef, ledgerItem, { merge: false });
      txn.set(txnFeeRewardsRef, { isCopiedToRaffles: true }, { merge: true });
    }
  });
}

export async function getApplicableRaffles(db: FirebaseFirestore.Firestore, chainId: ChainId, phaseId: string) {
  const stakerContracts = getRelevantStakerContracts(chainId);
  const applicableRafflesQueries: FirebaseFirestore.Query<StakingContractRaffle>[] = [];
  for (const stakerContract of stakerContracts) {
    const rafflesRef = db.collection(firestoreConstants.RAFFLES_COLL).doc(`${chainId}:${stakerContract}`);
    const stakerContractRaffles = rafflesRef
      .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL)
      .where('activePhaseIds', 'array-contains', phaseId) as FirebaseFirestore.Query<StakingContractRaffle>;
    applicableRafflesQueries.push(stakerContractRaffles);
  }
  const results = await Promise.all(applicableRafflesQueries.map((query) => query.get()));
  return results.flatMap((item) => item.docs);
}

function getEntrantFeesLedgerItem(
  txnFees: TransactionFeePhaseRewardsDoc,
  stakerContractAddress: string,
  stakerContractChainId: ChainId
): EntrantFeesLedgerItem {
  return {
    stakerContractAddress,
    stakerContractChainId,
    phaseId: txnFees.phaseId,
    phaseName: txnFees.phaseName,
    phaseIndex: txnFees.phaseIndex,
    chainId: txnFees.chainId,
    entrantAddress: txnFees.userAddress,
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
