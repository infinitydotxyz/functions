import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface CurationUser {
  userAddress: string;
  votes: number;
  chainId: ChainId;
  collectionAddress: string;
  totalProtocolFeesAccruedWei: string;
  blockProtocolFeesAccruedWei: string;
  firstVotedAt: number;
  lastVotedAt: number;
}

export type CurationUsers = { [userAddress: string]: CurationUser };

export interface CurationBlockRewardsDoc {
  collectionAddress: string;
  chainId: ChainId;

  numCurators: number;
  numCuratorVotes: number;

  numCuratorsAdded: number;
  numCuratorsRemoved: number;

  numCuratorVotesAdded: number;
  numCuratorVotesRemoved: number;

  numCuratorsPercentChange: number;
  numCuratorVotesPercentChange: number;

  /**
   * total fees accrued over all previous blocks
   * and this block
   */
  totalProtocolFeesAccruedWei: string;

  /**
   * fees accrued during this block
   */
  blockProtocolFeesAccruedWei: string;

  /**
   * arbitrage fees that are left over from previous blocks
   */
  arbitrageProtocolFeesAccruedWei: string;

  totalProtocolFeesAccruedEth: number;
  blockProtocolFeesAccruedEth: number;
  arbitrageProtocolFeesAccruedEth: number;

  /**
   * start timestamp of the block
   */
  timestamp: number;
}

export interface CurationBlockRewards extends CurationBlockRewardsDoc {
  users: CurationUsers;
}

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  updatedAt: number;
}

export enum CurationPeriodState {
  NotStarted = 'notStarted',
  InProgress = 'inProgress',
  Completed = 'completed'
}

export interface CurationPeriod {
  rewards: CurationBlockRewards;
  timestamp: number;
  state: CurationPeriodState;
}
