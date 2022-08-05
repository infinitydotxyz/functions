import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { formatEther } from 'ethers/lib/utils';
import {
  CurationLedgerEvent,
  CurationLedgerEventType,
  CurationLedgerSale,
  CurationVotesAdded,
  CurationVotesRemoved
} from '../aggregate-sales-stats/curation.types';
import { calcPercentChange, calculateStatsBigInt } from '../aggregate-sales-stats/utils';
import { CurationBlockRewards, CurationUser, CurationUsers } from './types';


interface BlockMetadata {
  /**
   * inclusive
   */
  blockStart: number;
  collectionAddress: string;
  chainId: ChainId;
}

/**
 * a curation block is a collection of curation events within an arbitrary 
 * range of ethereum blocks or timestamps 
 * 
 * its purpose is to calculate rewards for curators over this arbitrary range
 */
export class CurationBlock {
  private _sales: CurationLedgerSale[] = [];
  private _votes: CurationVotesAdded[] = [];
  private _votesRemoved: CurationVotesRemoved[] = [];

  constructor(public readonly metadata: BlockMetadata) {}

  public addEvent(event: CurationLedgerEventType) {
    switch (event.discriminator) {
      case CurationLedgerEvent.Sale:
        this._sales.push(event as CurationLedgerSale);
        break;
      case CurationLedgerEvent.VotesAdded:
        this._votes.push(event as CurationVotesAdded);
        break;
      case CurationLedgerEvent.VotesRemoved:
        this._votesRemoved.push(event as CurationVotesRemoved);
        break;
    }
  }

  get requiresRewardCalculation() {
    return this._votes.length > 0 || this._votesRemoved.length > 0;
  }

  get feesGeneratedWei() {
    const sum = calculateStatsBigInt(this._sales, (sale) => BigInt(sale.protocolFeeWei)).sum;
    return sum.toString();
  }

  get numVotesAdded(): number {
    return this._votes.reduce((acc, vote) => vote.votes + acc, 0);
  }

  get numVotesRemoved(): number {
    return this._votesRemoved.reduce((acc, vote) => vote.votes + acc, 0);
  }

  public getBlockRewards(prevBlockRewards: CurationBlockRewards): { blockRewards: CurationBlockRewards, usersAdded: CurationUsers, usersRemoved: CurationUsers} {
    const prevUsers = prevBlockRewards.users;
    const { updatedUsers: updatedUsersAfterRemovals, usersRemoved, numCuratorVotesRemoved } = this.applyVoteRemovals(
      prevUsers,
      this._votesRemoved
    );

    const { updatedUsers: updatedUsersAfterAdditions, newUsers, numCuratorVotesAdded } = this.applyVoteAdditions(
      updatedUsersAfterRemovals,
      this._votes
    );
    const voteStats = calculateStatsBigInt(Object.values(updatedUsersAfterAdditions), (user) => BigInt(user.votes));
    const blockProtocolFeesAccruedWei = BigInt(this.feesGeneratedWei);
    const totalProtocolFeesAccruedWei =
    blockProtocolFeesAccruedWei + BigInt(prevBlockRewards.totalProtocolFeesAccruedWei);
    const numCuratorVotes = parseInt(voteStats.sum.toString(), 10);
    const numCurators = voteStats.numItems;
    const blockRewardsBeforeDistribution: CurationBlockRewards = {
      users: updatedUsersAfterAdditions,
      collectionAddress: this.metadata.collectionAddress,
      chainId: this.metadata.chainId,
      numCurators,
      numCuratorVotes: numCuratorVotes,
      numCuratorsAdded: Object.keys(newUsers).length,
      numCuratorsRemoved: Object.keys(usersRemoved).length,
      numCuratorVotesRemoved,
      numCuratorVotesAdded,
      numCuratorsPercentChange: calcPercentChange(prevBlockRewards.numCurators, numCurators),
      numCuratorVotesPercentChange: calcPercentChange(prevBlockRewards.numCuratorVotes, numCuratorVotes),
      totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei.toString(),
      totalProtocolFeesAccruedEth: parseFloat(formatEther(totalProtocolFeesAccruedWei.toString())),
      blockProtocolFeesAccruedWei: blockProtocolFeesAccruedWei.toString(),
      blockProtocolFeesAccruedEth: parseFloat(formatEther(blockProtocolFeesAccruedWei.toString())),
      arbitrageProtocolFeesAccruedWei: prevBlockRewards.arbitrageProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedEth: prevBlockRewards.arbitrageProtocolFeesAccruedEth,
      timestamp: this.metadata.blockStart,
      isAggregated: false,
    };

    const blockRewards = this.distributeRewards(blockRewardsBeforeDistribution);

    return { blockRewards, usersRemoved, usersAdded: newUsers };
  }

  protected applyVoteRemovals(
    users: CurationUsers,
    votesRemoved: CurationVotesRemoved[]
  ): { updatedUsers: CurationUsers; usersRemoved: CurationUsers, numCuratorVotesRemoved: number } {
    const currentUsers: CurationUsers = JSON.parse(JSON.stringify(users));
    let numCuratorVotesRemoved = 0;
    for (const voteRemoved of votesRemoved) {
      const existingUser = currentUsers[voteRemoved.userAddress];
      if (!existingUser) {
        console.error(`User ${voteRemoved.userAddress} not found in history. Cannot remove votes`);
      } else {
        const userVotesRemaining = Math.max(existingUser.votes - voteRemoved.votes, 0);
        existingUser.votes = userVotesRemaining;
        numCuratorVotesRemoved += voteRemoved.votes;
      }
    }

    const usersRemoved = {} as CurationUsers;
    for (const [address, user] of Object.entries(currentUsers)) {
      if (user.votes <= 0) {
        user.votes = 0;
        delete currentUsers[address];
        usersRemoved[address] = user;
      }
    }

    return { updatedUsers: currentUsers, usersRemoved, numCuratorVotesRemoved };
  }

  protected applyVoteAdditions(
    users: CurationUsers,
    votesAdded: CurationVotesAdded[]
  ): { updatedUsers: CurationUsers; newUsers: CurationUsers, numCuratorVotesAdded: number } {
    const currentUsers: CurationUsers = JSON.parse(JSON.stringify(users));
    const newUsers = {} as CurationUsers;
    let numCuratorVotesAdded = 0;
    for (const voteAdded of votesAdded) {
      const existingUser = currentUsers[voteAdded.userAddress];
      numCuratorVotesAdded += voteAdded.votes;
      if (existingUser) {
        const updatedVotes = existingUser.votes + voteAdded.votes;
        existingUser.votes = updatedVotes;
        existingUser.lastVotedAt = this.metadata.blockStart;
      } else {
        const newUser: CurationUser = {
          userAddress: voteAdded.userAddress,
          votes: voteAdded.votes,
          totalProtocolFeesAccruedWei: '0',
          blockProtocolFeesAccruedWei: '0',
          firstVotedAt: this.metadata.blockStart,
          lastVotedAt: this.metadata.blockStart,
          collectionAddress: this.metadata.collectionAddress,
          chainId: this.metadata.chainId,
          updatedAt: Date.now(),
        };
        currentUsers[newUser.userAddress] = newUser;
        newUsers[newUser.userAddress] = { ...newUser };
      }
    }

    return { updatedUsers: currentUsers, newUsers, numCuratorVotesAdded };
  }

  protected distributeRewards(_rewards: CurationBlockRewards): CurationBlockRewards {
    const rewards: CurationBlockRewards = JSON.parse(JSON.stringify(_rewards));
    const totalVotes = rewards.numCuratorVotes;
    const fees = BigInt(rewards.blockProtocolFeesAccruedWei) + BigInt(rewards.arbitrageProtocolFeesAccruedWei);
    let feesDistributed = BigInt(0);
    for(const user of Object.values(rewards.users)) {
      const userVotes = user.votes;
      const userFees = (BigInt(userVotes) * BigInt(fees)) / BigInt(totalVotes);
      user.blockProtocolFeesAccruedWei = userFees.toString();
      feesDistributed += userFees;
      user.totalProtocolFeesAccruedWei = (BigInt(user.totalProtocolFeesAccruedWei) + userFees).toString();
      user.updatedAt = Date.now()
    }
    const feesRemaining = fees - feesDistributed;
    if(feesDistributed > fees) {
      throw new Error(`Fees distributed (${feesDistributed}) > fees (${fees})`);
    }
    
    return {
      ...rewards,
      arbitrageProtocolFeesAccruedWei: feesRemaining.toString(),
      arbitrageProtocolFeesAccruedEth: parseFloat(formatEther(feesRemaining.toString()))
    }
  }
}
