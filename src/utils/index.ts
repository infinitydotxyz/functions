import { BigNumber } from 'ethers';
import { formatEther } from 'ethers/lib/utils';

import {
  ChainId,
  Collection,
  CollectionDisplayData,
  NftDisplayData,
  StakeDuration,
  TokenStandard,
  UserDisplayData
} from '@infinityxyz/lib/types/core';
import { NftDto, UserProfileDto } from '@infinityxyz/lib/types/dto';
import { getCollectionDocId } from '@infinityxyz/lib/utils';
import { ONE_YEAR, firestoreConstants } from '@infinityxyz/lib/utils/constants';

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
  const principal = costPerVote * votes;

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
    [StakeDuration.None]: 1,
    [StakeDuration.ThreeMonths]: 2,
    [StakeDuration.SixMonths]: 3,
    [StakeDuration.TwelveMonths]: 4
  };

  const aprByMultiplier: Record<StakeDuration, number> = {
    [StakeDuration.None]: 0,
    [StakeDuration.ThreeMonths]: 0,
    [StakeDuration.SixMonths]: 0,
    [StakeDuration.TwelveMonths]: 0
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

export async function getNftDisplayData(
  db: FirebaseFirestore.Firestore,
  collectionAddress: string,
  collectionChainId: ChainId,
  tokenId: string,
  collection: CollectionDisplayData
): Promise<NftDisplayData> {
  const snap = await db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(getCollectionDocId({ collectionAddress, chainId: collectionChainId }))
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(tokenId)
    .get();

  const data = (snap.data() ?? {}) as Partial<NftDto>;
  return {
    collectionDisplayData: collection,
    tokenId,
    name: data?.metadata?.name ?? '',
    numTraitTypes: data?.numTraitTypes ?? 0,
    image: data?.metadata?.image ?? '',
    tokenStandard: data?.tokenStandard ?? TokenStandard.ERC721
  };
}

export async function getUserDisplayData(
  ref: FirebaseFirestore.DocumentReference<UserProfileDto>
): Promise<UserDisplayData> {
  const snap = await ref.get();
  const data = (snap.data() ?? {}) as Partial<UserDisplayData>;
  return {
    address: data.address || ref.id,
    displayName: data.displayName ?? '',
    username: data.username ?? '',
    profileImage: data.profileImage ?? '',
    bannerImage: data.bannerImage ?? ''
  };
}

export function partitionArray<T>(array: T[], size: number): T[][] {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function addressProgress(address: string): number {
  const max = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffff');
  const current = BigNumber.from(address);
  const num = parseFloat(current.mul(100_000).div(max).toString());
  return num / 1000;
}

// example: nFormatter(1234, 1) = > 1.2K
export function nFormatter(num: number | undefined | null, digits = 2) {
  if (!num) {
    return num;
  }
  const lookup = [
    { value: 1, symbol: '' },
    { value: 1e3, symbol: 'K' },
    { value: 1e6, symbol: 'M' },
    { value: 1e9, symbol: 'G' },
    { value: 1e12, symbol: 'T' },
    { value: 1e15, symbol: 'P' },
    { value: 1e18, symbol: 'E' }
  ];
  const regex = /\.0+$|(\.[0-9]*[1-9])0+$/;
  const item = lookup
    .slice()
    .reverse()
    .find(function (item) {
      return num >= item.value;
    });
  return item ? (num / item.value).toFixed(digits).replace(regex, '$1') + item.symbol : num.toFixed(digits + 1);
}
