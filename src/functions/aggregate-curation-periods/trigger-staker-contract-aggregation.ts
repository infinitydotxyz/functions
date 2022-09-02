import { ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { CurationPeriodAggregator } from '../aggregate-curation-ledger/curation-period-aggregator';
import { StakerContractPeriodDoc } from './types';
import { unAggregatedStakingContractPeriods } from './un-aggregated-staking-contract-periods';

export async function triggerStakerContractPeriodAggregation(db: FirebaseFirestore.Firestore) {
  const triggerAggregation = (contract: { address: string; chainId: ChainId; timestamp: number }) => {
    const stakerContractRef = db
      .collection(firestoreConstants.STAKING_CONTRACTS_COLL)
      .doc(`${contract.chainId}:${contract.address}`);
    const stakingContractPeriodRef = stakerContractRef
      .collection('stakerContractCurationPeriods') // TODO - move to constants
      .doc(`${contract.timestamp}`);

    const tokenContract = getTokenAddressByStakerAddress(contract.chainId, contract.address);
    const update: Pick<StakerContractPeriodDoc, 'metadata'> = {
      metadata: {
        stakerContractAddress: contract.address,
        stakerContractChainId: contract.chainId,
        tokenContractAddress: tokenContract.tokenContractAddress,
        tokenContractChainId: tokenContract.tokenContractChainId,
        timestamp: contract.timestamp,
        updatedAt: Date.now(),
        trigger: true,
        periodDuration: CurationPeriodAggregator.DURATION
      }
    };

    return { update, ref: stakingContractPeriodRef };
  };

  const batchHandler = new FirestoreBatchHandler();
  for await (const contract of unAggregatedStakingContractPeriods(db)) {
    const { update, ref } = triggerAggregation(contract);
    batchHandler.add(ref, update, { merge: true });
  }

  await batchHandler.flush();
}
