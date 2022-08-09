import { ChainId, StatsPeriod } from '@infinityxyz/lib/types/core';
import { calculateStatsBigInt, getStatsDocInfo } from '../aggregate-sales-stats/utils';
import { streamQueryWithRef } from '../firestore/stream-query';
import { formatEth } from '../utils';
import {
  CurationBlockRewards,
  CurationBlockRewardsDoc,
  CurationPeriodState,
  CurationPeriodUser,
  CurationPeriodUsers,
  CurationUser,
  CurationUsers
} from './types';
import { CurationPeriod as ICurationPeriod } from './types';

export class CurationPeriodAggregator {
  static getCurationPeriodRange(timestamp: number): {
    startTimestamp: number;
    endTimestamp: number;
    prevTimestamp: number;
  } {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Weekly).timestamp;
    const oneWeek = 60 * 60 * 24 * 7 * 1000;
    const endTimestamp = startTimestamp + oneWeek;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Weekly).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
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
        users: {} as CurationUsers
      };
      const usersQuery = ref.collection(
        'curationBlockUserRewards'
      ) as FirebaseFirestore.CollectionReference<CurationUser>;
      const usersStream = streamQueryWithRef(usersQuery, (item, ref) => [ref], { pageSize: 300 });
      for await (const { data: user } of usersStream) {
        if (user.userAddress) {
          block.users[user.userAddress] = user;
        }
      }
      blocks.push({ block, ref });
    }
    return blocks;
  }

  protected _startTimestamp: number;
  protected _endTimestamp: number;
  protected _prevTimestamp: number;

  constructor(timestamp: number, protected _collectionAddress: string, protected _chainId: ChainId) {
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
    const mostRecentBlock = blocks[blocks.length - 1];
    const blockProtocolFeeStats = calculateStatsBigInt(blocks, (block) => BigInt(block.blockProtocolFeesAccruedWei));
    const curationPeriod: ICurationPeriod = {
      collectionAddress: this._collectionAddress,
      chainId: this._chainId,
      timestamp: this._startTimestamp,
      totalProtocolFeesAccruedWei: mostRecentBlock.totalProtocolFeesAccruedWei,
      periodProtocolFeesAccruedWei: blockProtocolFeeStats.sum.toString(),
      totalProtocolFeesAccruedEth: mostRecentBlock.totalProtocolFeesAccruedEth,
      periodProtocolFeesAccruedEth: formatEth(blockProtocolFeeStats.sum),
      users: {} as CurationPeriodUsers,
      blocks
    };

    const usersBlockRewards: { [userAddress: string]: CurationUser[] } = {};

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

  protected calculateUserPeriodRewards(userBlockRewards: CurationUser[]) {
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
      updatedAt: Date.now(),
      votes: userBlockRewards[userBlockRewards.length - 1].votes,
    };
    return curationPeriodUser;
  }
}
