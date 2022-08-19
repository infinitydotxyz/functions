import { ChainId, CollectionDisplayData, StatsPeriod } from '@infinityxyz/lib/types/core';
import { calculateStats, calculateStatsBigInt, getStatsDocInfo } from '../aggregate-sales-stats/utils';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { calculateCollectionAprByMultiplier, calculateCuratorApr, formatEth } from '../../utils';
import { CurationBlock } from './curation-block';
import { CurationPeriodState } from './types';
import {
  CurationBlockRewards,
  CurationBlockRewardsDoc,
  CurationBlockUser,
  CurationPeriod,
  CurationPeriod as ICurationPeriod,
  CurationPeriodDoc,
  CurationPeriodUser,
  CurationPeriodUsers
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';

const ONE_WEEK = 60 * 60 * 24 * 7 * 1000;
export class CurationPeriodAggregator {
  static readonly DURATION = ONE_WEEK;

  static getCurationPeriodRange(timestamp: number): {
    startTimestamp: number;
    endTimestamp: number;
    prevTimestamp: number;
  } {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Weekly).timestamp;
    const endTimestamp = startTimestamp + CurationPeriodAggregator.DURATION;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Weekly).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
  }

  static async getCurationPeriodUsers(
    curationPeriodRef: FirebaseFirestore.DocumentReference<CurationPeriodDoc>
  ): Promise<CurationPeriodUsers> {
    const users: CurationPeriodUsers = {};
    const usersQuery = curationPeriodRef.collection(
      firestoreConstants.CURATION_PERIOD_USER_REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<CurationPeriodUser>;
    const usersStream = streamQueryWithRef(usersQuery, (item, ref) => [ref], { pageSize: 300 });
    for await (const { data: user } of usersStream) {
      if (user.metadata.userAddress) {
        users[user.metadata.userAddress] = user;
      }
    }
    return users;
  }

  static async getCurationPeriodBlocks(
    timestamp: number,
    curationBlockRewardsRef: FirebaseFirestore.CollectionReference<CurationBlockRewardsDoc>
  ): Promise<{ block: CurationBlockRewards; ref: FirebaseFirestore.DocumentReference<CurationBlockRewardsDoc> }[]> {
    const blocks: { block: CurationBlockRewards; ref: FirebaseFirestore.DocumentReference<CurationBlockRewardsDoc> }[] =
      [];
    const { startTimestamp, endTimestamp } = this.getCurationPeriodRange(timestamp);
    const blocksQuery = curationBlockRewardsRef
      .where('metadata.timestamp', '>=', startTimestamp)
      .where('metadata.timestamp', '<', endTimestamp)
      .orderBy('metadata.timestamp', 'asc');
    const blocksStream = streamQueryWithRef(blocksQuery, (item, ref) => [ref], { pageSize: 300 });
    for await (const { data: blockDocData, ref } of blocksStream) {
      const block: CurationBlockRewards = {
        ...blockDocData,
        users: await CurationBlock.getBlockUsers(ref)
      };
      blocks.push({ block, ref });
    }
    return blocks;
  }

  protected _startTimestamp: number;
  protected _endTimestamp: number;
  protected _prevTimestamp: number;

  constructor(
    timestamp: number,
    protected _collectionAddress: string,
    protected _chainId: ChainId,
    protected _stakerContractAddress: string,
    protected _stakerContractChainId: ChainId,
    protected _tokenContractAddress: string,
    protected _tokenContractChainId: ChainId
  ) {
    const { startTimestamp, endTimestamp, prevTimestamp } = CurationPeriodAggregator.getCurationPeriodRange(timestamp);
    this._startTimestamp = startTimestamp;
    this._endTimestamp = endTimestamp;
    this._prevTimestamp = prevTimestamp;
  }

  get state(): CurationPeriodState {
    const now = Date.now();
    if (now < this._startTimestamp) {
      return CurationPeriodState.NotStarted;
    } else if (now >= this._startTimestamp && now < this._endTimestamp) {
      return CurationPeriodState.InProgress;
    } else {
      return CurationPeriodState.Completed;
    }
  }

  getBlocksByPeriod(blocks: CurationBlockRewardsDoc[]): { [periodId: string]: CurationBlockRewardsDoc[] } {
    const blocksByPeriod = blocks.reduce((acc, block) => {
      const key = CurationPeriodAggregator.getCurationPeriodRange(block.metadata.timestamp).startTimestamp;
      const blocks = acc[`${key}`] ?? [];
      blocks.push(block);
      acc[key] = blocks;
      return acc;
    }, {} as { [key: string]: CurationBlockRewardsDoc[] });
    return blocksByPeriod;
  }

  getPeriodRewards(blocks: CurationBlockRewards[], collection: CollectionDisplayData): ICurationPeriod {
    const mostRecentBlock = blocks[blocks.length - 1] as CurationBlockRewards | undefined;
    const blockProtocolFeeStats = calculateStatsBigInt(blocks, (block) =>
      BigInt(block.stats.blockProtocolFeesAccruedWei)
    );
    const periodProtocolFeesAccruedEth = formatEth(blockProtocolFeeStats.sum);
    const avgTokenPrice = calculateStats(blocks, (block) => block.stats.tokenPrice).avg ?? 0;
    const avgStakePowerPerToken = calculateStats(blocks, (block) => block.stats.avgStakePowerPerToken).avg ?? 0;
    const avgVotes = calculateStats(blocks, (block) => block.stats.numCuratorVotes).avg ?? 0;
    const arbitrageClaimedWei =
      calculateStatsBigInt(blocks, (block) => BigInt(block.stats.arbitrageClaimedWei)).sum ?? BigInt(0);
    const periodPayoutWei =
      calculateStatsBigInt(blocks, (block) => BigInt(block.stats.blockPayoutWei)).sum ?? BigInt(0);
    const periodApr = calculateCuratorApr(
      periodProtocolFeesAccruedEth,
      avgTokenPrice,
      avgStakePowerPerToken,
      avgVotes,
      CurationPeriodAggregator.DURATION
    );
    const periodAprByMultiplier = calculateCollectionAprByMultiplier(
      periodProtocolFeesAccruedEth,
      avgTokenPrice,
      avgVotes,
      CurationPeriodAggregator.DURATION
    );
    const curationPeriod: CurationPeriod = {
      collection,
      metadata: {
        collectionAddress: this._collectionAddress,
        collectionChainId: this._chainId,
        timestamp: this._startTimestamp,
        stakerContractAddress: this._stakerContractAddress,
        stakerContractChainId: this._stakerContractChainId,
        tokenContractAddress: this._tokenContractAddress,
        tokenContractChainId: this._tokenContractChainId,
        periodDuration: CurationPeriodAggregator.DURATION
      },
      stats: {
        totalProtocolFeesAccruedWei: mostRecentBlock?.stats?.totalProtocolFeesAccruedWei ?? '0',
        periodProtocolFeesAccruedWei: blockProtocolFeeStats.sum.toString(),
        totalProtocolFeesAccruedEth: mostRecentBlock?.stats?.totalProtocolFeesAccruedEth ?? 0,
        periodProtocolFeesAccruedEth,
        tokenPrice: avgTokenPrice,
        periodAprByMultiplier: periodAprByMultiplier,
        avgStakePowerPerToken: avgStakePowerPerToken,
        periodApr,
        periodPayoutWei: periodPayoutWei.toString(),
        periodPayoutEth: formatEth(periodPayoutWei),
        arbitrageClaimedWei: arbitrageClaimedWei.toString(),
        arbitrageClaimedEth: formatEth(arbitrageClaimedWei)
      },
      users: {} as CurationPeriodUsers
    };

    const usersBlockRewards: { [userAddress: string]: CurationBlockUser[] } = {};

    for (const block of blocks) {
      for (const blockUser of Object.values(block.users)) {
        const userBlockRewards = usersBlockRewards[blockUser.metadata.userAddress] ?? [];
        userBlockRewards.push(blockUser);
        usersBlockRewards[blockUser.metadata.userAddress] = userBlockRewards;
      }
    }

    for (const [userAddress, userBlockRewards] of Object.entries(usersBlockRewards)) {
      const userPeriodRewards = this.calculateUserPeriodRewards(userBlockRewards, avgTokenPrice);
      const mostRecentUser = userBlockRewards?.[userBlockRewards.length - 1]?.user ?? {
        address: userAddress,
        displayName: '',
        username: '',
        profileImage: '',
        bannerImage: ''
      };
      curationPeriod.users[userAddress] = {
        ...userPeriodRewards,
        collection,
        user: mostRecentUser
      };
    }

    return curationPeriod;
  }

  protected calculateUserPeriodRewards(
    userBlockRewards: CurationBlockUser[],
    tokenPrice: number
  ): Omit<CurationPeriodUser, 'collection' | 'user'> {
    const blockProtocolFeeStats = calculateStatsBigInt(userBlockRewards, (block) =>
      BigInt(block.stats.blockProtocolFeesAccruedWei)
    );
    const totalProtocolFeesAccruedStats = calculateStatsBigInt(userBlockRewards, (block) => {
      return BigInt(block.stats.totalProtocolFeesAccruedWei);
    });
    const totalProtocolFeesAccruedWei = (totalProtocolFeesAccruedStats.max ?? '0').toString();
    const periodProtocolFeesAccruedEth = formatEth(blockProtocolFeeStats.sum);
    const avgUserStakePowerPerToken =
      calculateStats(userBlockRewards, (block) => block.stats.stake.stakePowerPerToken).avg ?? 0;
    const avgVotes = calculateStats(userBlockRewards, (block) => block.stats.votes).avg ?? 0;
    const periodApr = calculateCuratorApr(
      periodProtocolFeesAccruedEth,
      tokenPrice,
      avgUserStakePowerPerToken,
      avgVotes,
      CurationPeriodAggregator.DURATION
    );
    const curationPeriodUser: Omit<CurationPeriodUser, 'collection' | 'user'> = {
      metadata: {
        userAddress: userBlockRewards[0]?.metadata?.userAddress,
        collectionAddress: this._collectionAddress,
        collectionChainId: this._chainId,
        stakerContractAddress: this._stakerContractAddress,
        stakerContractChainId: this._stakerContractChainId,
        updatedAt: Date.now(),
        tokenContractAddress: this._tokenContractAddress,
        tokenContractChainId: this._tokenContractChainId,
        timestamp: this._startTimestamp,
        periodDuration: CurationPeriodAggregator.DURATION
      },
      stats: {
        totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei.toString(),
        periodProtocolFeesAccruedWei: blockProtocolFeeStats.sum.toString(),
        totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei),
        periodProtocolFeesAccruedEth,
        tokenPrice,
        periodApr
      }
    };
    return curationPeriodUser;
  }
}
