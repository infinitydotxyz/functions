import {
  CurationLedgerEvent,
  CurationLedgerEventType,
  CurationLedgerSale,
  CurationVotesAdded,
  CurationVotesRemoved
} from '../aggregate-sales-stats/curation.types';
import { calculateStatsBigInt } from '../aggregate-sales-stats/utils';
import { CurationBlockRewards, CurationUsers } from './types';


interface BlockMetadata {
  /**
   * inclusive
   */
  blockStart: number;
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
    const { updatedUsers: updatedUsersAfterRemovals, usersRemoved } = this.applyVoteRemovals(
      prevUsers,
      this._votesRemoved
    );

    const { updatedUsers: updatedUsersAfterAdditions, newUsers } = this.applyVoteAdditions(
      updatedUsersAfterRemovals,
      this._votes
    );
    const voteStats = calculateStatsBigInt(Object.values(updatedUsersAfterAdditions), (user) => BigInt(user.votes));
    const blockProtocolFeesAccruedWei = BigInt(this.feesGeneratedWei);
    const totalProtocolFeesAccruedWei =
    blockProtocolFeesAccruedWei + BigInt(prevBlockRewards.totalProtocolFeesAccruedWei);

    const blockRewardsBeforeDistribution: CurationBlockRewards = {
      users: updatedUsersAfterAdditions,
      numCurators: voteStats.numItems,
      numCuratorVotes: parseInt(voteStats.sum.toString(), 10),
      totalProtocolFeesAccruedWei: totalProtocolFeesAccruedWei.toString(),
      blockProtocolFeesAccruedWei: blockProtocolFeesAccruedWei.toString(),
      startTimestamp: this.metadata.blockStart
    };

    const blockRewards = this.distributeRewards(blockRewardsBeforeDistribution);

    return { blockRewards, usersRemoved, usersAdded: newUsers };
  }

  protected applyVoteRemovals(
    users: CurationUsers,
    votesRemoved: CurationVotesRemoved[]
  ): { updatedUsers: CurationUsers; usersRemoved: CurationUsers } {
    const currentUsers: CurationUsers = JSON.parse(JSON.stringify(users));

    for (const voteRemoved of votesRemoved) {
      const existingUser = currentUsers[voteRemoved.userAddress];
      if (!existingUser) {
        console.error(`User ${voteRemoved.userAddress} not found in history. Cannot remove votes`);
      } else {
        const userVotesRemaining = Math.max(existingUser.votes - voteRemoved.votes, 0);
        existingUser.votes = userVotesRemaining;
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

    return { updatedUsers: currentUsers, usersRemoved };
  }

  protected applyVoteAdditions(
    users: CurationUsers,
    votesAdded: CurationVotesAdded[]
  ): { updatedUsers: CurationUsers; newUsers: CurationUsers } {
    const currentUsers: CurationUsers = JSON.parse(JSON.stringify(users));
    const newUsers = {} as CurationUsers;
    for (const voteAdded of votesAdded) {
      const existingUser = currentUsers[voteAdded.userAddress];
      if (existingUser) {
        const updatedVotes = existingUser.votes + voteAdded.votes;
        existingUser.votes = updatedVotes;
      } else {
        const newUser = {
          userAddress: voteAdded.userAddress,
          votes: voteAdded.votes,
          totalProtocolFeesAccruedWei: '0',
          blockProtocolFeesAccruedWei: '0'
        };
        currentUsers[newUser.userAddress] = newUser;
        newUsers[newUser.userAddress] = { ...newUser };
      }
    }

    return { updatedUsers: currentUsers, newUsers };
  }

  protected distributeRewards(_rewards: CurationBlockRewards): CurationBlockRewards {
    const rewards: CurationBlockRewards = JSON.parse(JSON.stringify(_rewards));
    const totalVotes = rewards.numCuratorVotes;
    const fees = rewards.blockProtocolFeesAccruedWei;
    for(const user of Object.values(rewards.users)) {
      const userVotes = user.votes;
      const userFees = (BigInt(userVotes) * BigInt(fees)) / BigInt(totalVotes);
      user.blockProtocolFeesAccruedWei = userFees.toString();
      user.totalProtocolFeesAccruedWei = (BigInt(user.totalProtocolFeesAccruedWei) + userFees).toString();
    }
    return rewards;
  }
}
