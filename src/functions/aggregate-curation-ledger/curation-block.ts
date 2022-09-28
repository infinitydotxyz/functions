import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import {
  CurationLedgerSale,
  CurationBlockRewardsDoc,
  CurationLedgerEvent,
  CurationBlockRewards,
  CurationLedgerVotesAddedWithStake,
  CurationLedgerVotesRemovedWithStake,
  CurationLedgerEventsWithStake,
  CurationLedgerEventStake,
  CurationBlockUser,
  CurationBlockUsers
} from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { formatEther } from 'ethers/lib/utils';
import { calcPercentChange, calculateStats, calculateStatsBigInt } from '../aggregate-sales-stats/utils';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { calculateCollectionAprByMultiplier, calculateCuratorApr, formatEth, round } from '../../utils';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CollectionDisplayData, Erc20TokenMetadata, StakeDuration } from '@infinityxyz/lib/types/core';

interface BlockMetadata {
  /**
   * inclusive
   */
  blockStart: number;
  collectionAddress: string;
  chainId: ChainId;
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  token: Erc20TokenMetadata;
}

/**
 * a curation block is a collection of curation events within an arbitrary
 * range of ethereum blocks or timestamps
 *
 * its purpose is to calculate rewards for curators over this arbitrary range
 */
export class CurationBlock {
  private _sales: CurationLedgerSale[] = [];
  private _votes: CurationLedgerVotesAddedWithStake[] = [];
  private _votesRemoved: CurationLedgerVotesRemovedWithStake[] = [];
  private _blockNumber: number;

  public get blockNumber(): number {
    return this._blockNumber;
  }

  static async getBlockUsers(
    blockRewardsRef: FirebaseFirestore.DocumentReference<CurationBlockRewardsDoc>
  ): Promise<CurationBlockUsers> {
    const users: CurationBlockUsers = {};
    const usersQuery = blockRewardsRef.collection(
      firestoreConstants.CURATION_BLOCK_USER_REWARDS_COLL
    ) as FirebaseFirestore.CollectionReference<CurationBlockUser>;
    const usersStream = streamQueryWithRef(usersQuery, (item, ref) => [ref], { pageSize: 300 });
    for await (const { data: user } of usersStream) {
      if (user?.metadata?.userAddress) {
        users[user.metadata.userAddress] = user;
      }
    }
    return users;
  }

  constructor(public readonly metadata: BlockMetadata) {
    this._blockNumber = Number.NaN;
  }

  public addEvent(event: CurationLedgerEventsWithStake) {
    if (!this._blockNumber || event.blockNumber < this._blockNumber) {
      this._blockNumber = event.blockNumber;
    }
    switch (event.discriminator) {
      case CurationLedgerEvent.Sale:
        this._sales.push(event);
        break;
      case CurationLedgerEvent.VotesAdded:
        this._votes.push(event);
        break;
      case CurationLedgerEvent.VotesRemoved:
        this._votesRemoved.push(event);
        break;
    }
  }

  get feesGeneratedWei() {
    const sum = calculateStatsBigInt(this._sales, (sale) => BigInt(sale.feesGenerated.feesGeneratedWei)).sum;
    return sum.toString();
  }

  get numVotesAdded(): number {
    return this._votes.reduce((acc, vote) => vote.votes + acc, 0);
  }

  get numVotesRemoved(): number {
    return this._votesRemoved.reduce((acc, vote) => vote.votes + acc, 0);
  }

  public getBlockRewards(
    prevBlockRewards: CurationBlockRewards,
    tokenPrice: number,
    collection: CollectionDisplayData
  ): {
    blockRewards: CurationBlockRewards;
    usersAdded: CurationBlockUsers;
    usersRemoved: CurationBlockUsers;
  } {
    const prevUsers = prevBlockRewards.users;
    const {
      updatedUsers: updatedUsersAfterAdditions,
      newUsers,
      numCuratorVotesAdded
    } = this.applyVoteAdditions(prevUsers, this._votes, collection);

    const {
      updatedUsers: updatedUsersAfterRemovals,
      usersRemoved,
      numCuratorVotesRemoved
    } = this.applyVoteRemovals(updatedUsersAfterAdditions, this._votesRemoved);

    const voteStats = calculateStatsBigInt(Object.values(updatedUsersAfterAdditions), (user) =>
      BigInt(user.stats.votes)
    );
    const blockProtocolFeesAccruedWei = BigInt(this.feesGeneratedWei);
    const totalProtocolFeesAccruedWei =
      blockProtocolFeesAccruedWei + BigInt(prevBlockRewards.stats.totalProtocolFeesAccruedWei);
    const numCuratorVotes = parseInt(voteStats.sum.toString(), 10);
    const numCurators = voteStats.numItems;

    const updatedUsersAfterStatsUpdate = this.updateVoteStats(updatedUsersAfterRemovals, numCurators, numCuratorVotes);

    const blockRewardsBeforeDistribution: CurationBlockRewards = {
      collection,
      users: updatedUsersAfterStatsUpdate,
      metadata: {
        collectionAddress: this.metadata.collectionAddress,
        collectionChainId: this.metadata.chainId,
        timestamp: this.metadata.blockStart,
        isAggregated: false,
        stakerContractAddress: this.metadata.stakerContractAddress,
        stakerContractChainId: this.metadata.stakerContractChainId,
        tokenContractAddress: this.metadata.token.address,
        tokenContractChainId: this.metadata.token.chainId,
        blockDuration: CurationBlockAggregator.DURATION,
        blockNumber: this._blockNumber
      },
      stats: {
        numCurators,
        numCuratorVotes: numCuratorVotes,
        numCuratorsAdded: Object.keys(newUsers).length,
        numCuratorsRemoved: Object.keys(usersRemoved).length,
        numCuratorVotesRemoved,
        numCuratorVotesAdded,
        numCuratorsPercentChange: calcPercentChange(prevBlockRewards.stats.numCurators, numCurators),
        numCuratorVotesPercentChange: calcPercentChange(prevBlockRewards.stats.numCuratorVotes, numCuratorVotes),
        totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei.toString(),
        totalProtocolFeesAccruedEth: parseFloat(formatEther(totalProtocolFeesAccruedWei.toString())),
        blockProtocolFeesAccruedWei: blockProtocolFeesAccruedWei.toString(),
        blockProtocolFeesAccruedEth: parseFloat(formatEther(blockProtocolFeesAccruedWei.toString())),
        arbitrageProtocolFeesAccruedWei: '0',
        arbitrageProtocolFeesAccruedEth: 0,
        totalArbitrageProtocolFeesAccruedWei: prevBlockRewards.stats.arbitrageProtocolFeesAccruedWei,
        totalArbitrageProtocolFeesAccruedEth: prevBlockRewards.stats.arbitrageProtocolFeesAccruedEth,
        tokenPrice: tokenPrice,
        blockPayoutEth: 0,
        blockPayoutWei: '0',
        avgStakePowerPerToken: 0,
        blockApr: 0,
        blockAprByMultiplier: {
          [StakeDuration.None]: 0,
          [StakeDuration.ThreeMonths]: 0,
          [StakeDuration.SixMonths]: 0,
          [StakeDuration.TwelveMonths]: 0
        }
      }
    };

    const blockRewardsAfterDistribution = this.distributeRewards(blockRewardsBeforeDistribution);

    const blockRewards = this.updateAPRs(blockRewardsAfterDistribution);

    return { blockRewards, usersRemoved, usersAdded: newUsers };
  }

  protected applyVoteRemovals(
    users: CurationBlockUsers,
    votesRemoved: CurationLedgerVotesRemovedWithStake[]
  ): { updatedUsers: CurationBlockUsers; usersRemoved: CurationBlockUsers; numCuratorVotesRemoved: number } {
    const currentUsers: CurationBlockUsers = JSON.parse(JSON.stringify(users));
    let numCuratorVotesRemoved = 0;
    for (const voteRemoved of votesRemoved) {
      const existingUser = currentUsers[voteRemoved.userAddress];
      if (!existingUser) {
        console.error(`User ${voteRemoved.userAddress} not found in history. Cannot remove votes`);
      } else {
        const userVotesRemaining = Math.max(existingUser.stats.votes - voteRemoved.votes, 0);
        existingUser.stats.votes = userVotesRemaining;
        numCuratorVotesRemoved += voteRemoved.votes;
      }
    }

    const usersRemoved = {} as CurationBlockUsers;
    for (const [address, user] of Object.entries(currentUsers)) {
      if (user.stats.votes <= 0) {
        user.stats.votes = 0;
        delete currentUsers[address];
        usersRemoved[address] = user;
      }
    }

    return { updatedUsers: currentUsers, usersRemoved, numCuratorVotesRemoved };
  }

  protected updateVoteStats(
    users: CurationBlockUsers,
    numCurators: number,
    numCuratorVotes: number
  ): CurationBlockUsers {
    const updatedUsers: CurationBlockUsers = JSON.parse(JSON.stringify(users));
    for (const [, user] of Object.entries(updatedUsers)) {
      user.stats.numCurators = numCurators;
      user.stats.numCuratorVotes = numCuratorVotes;
      user.stats.curatorShare = round((user.stats.votes / numCuratorVotes) * 100);
    }
    return updatedUsers;
  }

  protected applyVoteAdditions(
    users: CurationBlockUsers,
    votesAdded: CurationLedgerVotesAddedWithStake[],
    collection: CollectionDisplayData
  ): { updatedUsers: CurationBlockUsers; newUsers: CurationBlockUsers; numCuratorVotesAdded: number } {
    const currentUsers: CurationBlockUsers = JSON.parse(JSON.stringify(users));
    const newUsers = {} as CurationBlockUsers;
    let numCuratorVotesAdded = 0;
    for (const voteAdded of votesAdded) {
      const existingUser = currentUsers[voteAdded.userAddress];
      numCuratorVotesAdded += voteAdded.votes;
      if (existingUser) {
        const updatedVotes = existingUser.stats.votes + voteAdded.votes;
        existingUser.stats.votes = updatedVotes;
        existingUser.stats.lastVotedAt = this.metadata.blockStart;
        if (existingUser.stats.stake.stakerEventBlockNumber < voteAdded.stake.stakerEventBlockNumber) {
          existingUser.stats.stake = voteAdded.stake;
        }
      } else {
        const newUser = this.getNewUser(voteAdded.userAddress, voteAdded.stake, voteAdded.votes, collection);
        currentUsers[newUser.metadata.userAddress] = newUser;
        newUsers[newUser.metadata.userAddress] = { ...newUser };
      }
    }

    return { updatedUsers: currentUsers, newUsers, numCuratorVotesAdded };
  }

  protected distributeRewards(_rewards: CurationBlockRewards): CurationBlockRewards {
    const rewards: CurationBlockRewards = JSON.parse(JSON.stringify(_rewards));
    const totalVotes = rewards.stats.numCuratorVotes;
    const fees = BigInt(rewards.stats.blockProtocolFeesAccruedWei);
    let feesDistributed = BigInt(0);

    for (const user of Object.values(rewards.users)) {
      const userVotes = user.stats.votes;
      const userFees = (BigInt(userVotes) * BigInt(fees)) / BigInt(totalVotes);
      user.stats.blockProtocolFeesAccruedWei = userFees.toString();
      feesDistributed += userFees;
      user.stats.totalProtocolFeesAccruedWei = (BigInt(user.stats.totalProtocolFeesAccruedWei) + userFees).toString();
      user.metadata.updatedAt = Date.now();
      user.stats.totalProtocolFeesAccruedEth = formatEth(user.stats.totalProtocolFeesAccruedWei);
      user.stats.blockProtocolFeesAccruedEth = formatEth(user.stats.blockProtocolFeesAccruedWei);
    }
    const feesRemaining = fees - feesDistributed;
    if (feesDistributed > fees) {
      throw new Error(`Fees distributed (${feesDistributed}) > fees (${fees})`);
    }
    const blockArbitrage = feesRemaining.toString();
    const totalArbitrageProtocolFeesAccruedWei =
      BigInt(rewards.stats.totalArbitrageProtocolFeesAccruedWei) + BigInt(blockArbitrage);

    return {
      ...rewards,
      stats: {
        ...rewards.stats,
        arbitrageProtocolFeesAccruedWei: blockArbitrage,
        arbitrageProtocolFeesAccruedEth: parseFloat(formatEther(blockArbitrage)),
        totalArbitrageProtocolFeesAccruedWei: totalArbitrageProtocolFeesAccruedWei.toString(),
        totalArbitrageProtocolFeesAccruedEth: parseFloat(formatEther(totalArbitrageProtocolFeesAccruedWei.toString())),
        blockPayoutWei: fees.toString(),
        blockPayoutEth: formatEth(fees)
      }
    };
  }

  protected updateAPRs(_rewards: CurationBlockRewards): CurationBlockRewards {
    const rewards: CurationBlockRewards = JSON.parse(JSON.stringify(_rewards));
    const collectionApr = calculateCollectionAprByMultiplier(
      rewards.stats.blockProtocolFeesAccruedEth,
      rewards.stats.tokenPrice,
      rewards.stats.numCuratorVotes,
      rewards.metadata.blockDuration
    );
    rewards.stats.blockAprByMultiplier = collectionApr;
    for (const user of Object.values(rewards.users)) {
      user.stats.tokenPrice = rewards.stats.tokenPrice;
      user.stats.blockApr = calculateCuratorApr(
        user.stats.blockProtocolFeesAccruedEth,
        user.stats.tokenPrice,
        user.stats.stake.stakePowerPerToken,
        user.stats.votes,
        user.metadata.blockDuration
      );
    }

    const avgStakePowerPerToken = calculateStats(
      Object.values(rewards.users),
      (user) => user.stats.stake.stakePowerPerToken
    ).avg;
    rewards.stats.avgStakePowerPerToken = avgStakePowerPerToken ?? 0;
    rewards.stats.blockApr = calculateCuratorApr(
      rewards.stats.blockProtocolFeesAccruedEth,
      rewards.stats.tokenPrice,
      rewards.stats.avgStakePowerPerToken,
      rewards.stats.numCuratorVotes,
      rewards.metadata.blockDuration
    );
    return rewards;
  }

  protected getNewUser(
    userAddress: string,
    stake: CurationLedgerEventStake,
    votes: number,
    collection: CollectionDisplayData
  ): CurationBlockUser {
    const newUser: CurationBlockUser = {
      collection,
      user: {
        address: userAddress,
        displayName: '',
        username: '',
        profileImage: '',
        bannerImage: ''
      },
      metadata: {
        userAddress,
        stakerContractAddress: this.metadata.stakerContractAddress,
        stakerContractChainId: this.metadata.stakerContractChainId,
        tokenContractAddress: this.metadata.token.address,
        tokenContractChainId: this.metadata.token.chainId,
        collectionAddress: this.metadata.collectionAddress,
        collectionChainId: this.metadata.chainId,
        updatedAt: Date.now(),
        blockNumber: this._blockNumber,
        timestamp: this.metadata.blockStart,
        blockDuration: CurationBlockAggregator.DURATION
      },
      stats: {
        votes,
        stake: stake,
        firstVotedAt: this.metadata.blockStart,
        lastVotedAt: this.metadata.blockStart,
        totalProtocolFeesAccruedWei: '0',
        blockProtocolFeesAccruedWei: '0',
        totalProtocolFeesAccruedEth: 0,
        blockProtocolFeesAccruedEth: 0,
        curatorShare: 0,
        numCurators: 0,
        numCuratorVotes: 0,
        tokenPrice: 0,
        blockApr: 0
      }
    };

    return newUser;
  }
}
