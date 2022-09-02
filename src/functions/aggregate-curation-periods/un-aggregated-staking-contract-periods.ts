import { ChainId, CurationPeriodDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

export async function* unAggregatedStakingContractPeriods(
  db: FirebaseFirestore.Firestore
): AsyncGenerator<{ address: string; chainId: ChainId; timestamp: number }> {
  const curationPeriodRewards = db.collectionGroup(
    firestoreConstants.CURATION_PERIOD_REWARDS_COLL
  ) as FirebaseFirestore.CollectionGroup<CurationPeriodDoc>;

  const getNextStakingContract = async (lastContract?: {
    address: string;
    chainId: ChainId;
  }): Promise<{ address: string; chainId: ChainId } | null> => {
    let query = curationPeriodRewards.where('metadata.isAggregated', '==', false);
    if (lastContract?.address) {
      query = query.where('metadata.stakerContractAddress', '<', lastContract.address);
    }

    query = query.orderBy('metadata.stakerContractAddress', 'desc').limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }
    const contractDoc = snapshot.docs?.[0];

    if (!contractDoc) {
      return null;
    }

    const contract = contractDoc.data();
    if (!contract?.metadata?.stakerContractAddress) {
      return null;
    }

    return {
      address: contract.metadata.stakerContractAddress,
      chainId: contract.metadata.stakerContractChainId
    };
  };

  const getPeriodsRequiringAggregation = async (stakingContract: {
    address: string;
    chainId: ChainId;
    timestamp?: number;
  }) => {
    const query = curationPeriodRewards
      .where('metadata.stakerContractAddress', '==', stakingContract.address)
      .where('metadata.isAggregated', '==', false)
      .where('metadata.timestamp', '<', stakingContract.timestamp || Date.now())
      .orderBy('metadata.timestamp', 'desc')
      .limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    const periodDoc = snapshot.docs?.[0];
    if (!periodDoc) {
      return null;
    }

    const period = periodDoc.data();
    if (!period?.metadata?.timestamp || !period?.metadata?.stakerContractAddress) {
      return null;
    }

    return {
      address: period.metadata.stakerContractAddress,
      chainId: period.metadata.stakerContractChainId,
      timestamp: period.metadata.timestamp
    };
  };

  let lastContract: undefined | { address: string; chainId: ChainId };
  while (true) {
    const contract = await getNextStakingContract(lastContract);
    if (!contract) {
      return;
    }

    let lastPeriod = { ...contract, timestamp: Date.now() };
    while (true) {
      const period = await getPeriodsRequiringAggregation(lastPeriod);
      if (!period) {
        break;
      }
      yield period;
      lastPeriod = period;
    }
    lastContract = contract;
  }
}
