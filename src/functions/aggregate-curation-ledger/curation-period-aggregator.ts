import { ChainId, StatsPeriod } from '@infinityxyz/lib/types/core';
import { calculateStatsBigInt, getStatsDocInfo } from '../aggregate-sales-stats/utils';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { formatEth } from '../../utils';
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
      if (user.userAddress) {
        users[user.userAddress] = user;
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
      .where('timestamp', '>=', startTimestamp)
      .where('timestamp', '<', endTimestamp)
      .orderBy('timestamp', 'asc');
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
    protected _stakerContractChainId: ChainId
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
      const key = CurationPeriodAggregator.getCurationPeriodRange(block.timestamp).startTimestamp;
      const blocks = acc[`${key}`] ?? [];
      blocks.push(block);
      acc[key] = blocks;
      return acc;
    }, {} as { [key: string]: CurationBlockRewardsDoc[] });
    return blocksByPeriod;
  }

  getPeriodRewards(blocks: CurationBlockRewards[]): ICurationPeriod {
    const mostRecentBlock = blocks[blocks.length - 1] as CurationBlockRewards | undefined;
    const blockProtocolFeeStats = calculateStatsBigInt(blocks, (block) => BigInt(block.blockProtocolFeesAccruedWei));
    const curationPeriod: CurationPeriod = {
      collectionAddress: this._collectionAddress,
      chainId: this._chainId,
      timestamp: this._startTimestamp,
      totalProtocolFeesAccruedWei: mostRecentBlock?.totalProtocolFeesAccruedWei ?? '0',
      periodProtocolFeesAccruedWei: blockProtocolFeeStats.sum.toString(),
      totalProtocolFeesAccruedEth: mostRecentBlock?.totalProtocolFeesAccruedEth ?? 0,
      periodProtocolFeesAccruedEth: formatEth(blockProtocolFeeStats.sum),
      stakerContractAddress: this._stakerContractAddress,
      stakerContractChainId: this._stakerContractChainId,
      users: {} as CurationPeriodUsers
    };

    const usersBlockRewards: { [userAddress: string]: CurationBlockUser[] } = {};

    for (const block of blocks) {
      for (const blockUser of Object.values(block.users)) {
        const userBlockRewards = usersBlockRewards[blockUser.userAddress] ?? [];
        userBlockRewards.push(blockUser);
        usersBlockRewards[blockUser.userAddress] = userBlockRewards;
      }
    }

    for (const [userAddress, userBlockRewards] of Object.entries(usersBlockRewards)) {
      const userPeriodRewards = this.calculateUserPeriodRewards(userBlockRewards);
      curationPeriod.users[userAddress] = userPeriodRewards;
    }

    return curationPeriod;
  }

  protected calculateUserPeriodRewards(userBlockRewards: CurationBlockUser[]) {
    const blockProtocolFeeStats = calculateStatsBigInt(userBlockRewards, (block) =>
      BigInt(block.blockProtocolFeesAccruedWei)
    );
    const totalProtocolFeesAccruedStats = calculateStatsBigInt(userBlockRewards, (block) => {
      return BigInt(block.totalProtocolFeesAccruedWei);
    });
    const totalProtocolFeesAccruedWei = (totalProtocolFeesAccruedStats.max ?? '0').toString();
    const curationPeriodUser: CurationPeriodUser = {
      userAddress: userBlockRewards[0].userAddress,
      chainId: this._chainId,
      collectionAddress: this._collectionAddress,
      totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei.toString(),
      periodProtocolFeesAccruedWei: blockProtocolFeeStats.sum.toString(),
      totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei),
      periodProtocolFeesAccruedEth: formatEth(blockProtocolFeeStats.sum),
      stakerContractAddress: this._stakerContractAddress,
      stakerContractChainId: this._stakerContractChainId,
      updatedAt: Date.now()
    };
    return curationPeriodUser;
  }
}
