import { ChainId, Collection, CollectionDisplayData, StakeDuration } from '@infinityxyz/lib/types/core';
import { getCollectionDocId } from '@infinityxyz/lib/utils';
import { firestoreConstants, ONE_YEAR } from '@infinityxyz/lib/utils/constants';
import { formatEther } from 'ethers/lib/utils';

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export function formatEth(wei: string | bigint | number): number {
  return parseFloat(formatEther(BigInt(wei).toString()));
}

export function round(value: number, decimals = 4): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateCuratorApr(
  curatorPeriodInterest: number,
  tokenPrice: number,
  stakePowerPerToken: number,
  votes: number,
  periodDuration: number,
  precision = 8
) {
  if (stakePowerPerToken === 0) {
    return 0;
  }
  /**
   * ETH/vote = ETH/TOKEN / votes/TOKEN
   */
  const costPerVote = tokenPrice / stakePowerPerToken;

  if (votes === 0) {
    return 0;
  }
  /**
   * ETH = ETH/vote * votes
   */
  const principal = costPerVote / votes;

  if (principal === 0) {
    return 0;
  }
  const periodicInterestRate = curatorPeriodInterest / principal;

  const periodsInOneYear = ONE_YEAR / periodDuration;

  const aprDecimal = periodicInterestRate * periodsInOneYear;

  const aprPercent = round(aprDecimal * 100, precision);

  return aprPercent;
}

export function calculateCollectionAprByMultiplier(
  periodInterest: number,
  tokenPrice: number,
  numCuratorVotes: number,
  periodDuration: number,
  precision = 8
) {
  const multipliers: Record<StakeDuration, number> = {
    [StakeDuration.X0]: 1,
    [StakeDuration.X3]: 2,
    [StakeDuration.X6]: 3,
    [StakeDuration.X12]: 4
  };

  const aprByMultiplier: Record<StakeDuration, number> = {
    [StakeDuration.X0]: 0,
    [StakeDuration.X3]: 0,
    [StakeDuration.X6]: 0,
    [StakeDuration.X12]: 0
  };

  for (const [stakeDuration, multiplier] of Object.entries(multipliers) as unknown as [StakeDuration, number][]) {
    const apr = calculateCuratorApr(periodInterest, tokenPrice, multiplier, numCuratorVotes, periodDuration, precision);
    aprByMultiplier[stakeDuration] = apr;
  }

  return aprByMultiplier;
}

export async function getCollectionDisplayData(
  db: FirebaseFirestore.Firestore,
  collectionAddress: string,
  collectionChainId: ChainId
): Promise<CollectionDisplayData> {
  const snap = await db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(getCollectionDocId({ collectionAddress, chainId: collectionChainId }))
    .get();
  const data = snap.data() as Partial<Collection>;

  return {
    chainId: collectionChainId,
    address: collectionAddress,
    hasBlueCheck: data?.hasBlueCheck ?? false,
    slug: data?.slug || '',
    name: data?.metadata?.name || '',
    profileImage: data?.metadata?.profileImage || '',
    bannerImage: data?.metadata?.bannerImage || ''
  };
}
