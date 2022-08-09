import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface CurationUser {
  userAddress: string;
  votes: number;
  chainId: ChainId;
  collectionAddress: string;
  totalProtocolFeesAccruedWei: string;
  blockProtocolFeesAccruedWei: string;
  totalProtocolFeesAccruedEth: number;
  blockProtocolFeesAccruedEth: number;
  firstVotedAt: number;
  lastVotedAt: number;
  updatedAt: number;
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
  isAggregated: boolean;
}

export interface CurationBlockRewards extends CurationBlockRewardsDoc {
  users: CurationUsers;
}

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  updatedAt: number;
  periodsRequireAggregation: boolean;
  currentSnippetRequiresAggregation: boolean;
}

export enum CurationPeriodState {
  NotStarted = 'notStarted',
  InProgress = 'inProgress',
  Completed = 'completed'
}

export interface CurationPeriodDoc {
  collectionAddress: string;
  chainId: ChainId;
  timestamp: number;
  /**
   * total fees accrued over all previous periods
   */
  totalProtocolFeesAccruedWei: string;

  /**
   * fees accrued during this period
   */
  periodProtocolFeesAccruedWei: string;

  totalProtocolFeesAccruedEth: number;
  periodProtocolFeesAccruedEth: number;
}

export interface CurationPeriodUser {
  userAddress: string;
  chainId: ChainId;
  collectionAddress: string;
  totalProtocolFeesAccruedWei: string;
  periodProtocolFeesAccruedWei: string;
  totalProtocolFeesAccruedEth: number;
  periodProtocolFeesAccruedEth: number;
  updatedAt: number;
}

export type CurationPeriodUsers = { [userAddress: string]: CurationPeriodUser };

export interface CurationPeriod extends CurationPeriodDoc {
  users: CurationPeriodUsers;
  blocks: CurationBlockRewards[];
}


export interface CurrentCurationSnippet {
  currentPeriod: CurationPeriod;
  currentBlock: CurationBlockRewards;

  prevPeriod: CurationPeriod;
  prevBlock: CurationPeriod;
} 

export interface CurrentCurationSnippetDoc {
  currentPeriod: CurationPeriodDoc;
  currentPeriodTopUsers: CurationPeriodUser[];
  prevPeriod: CurationPeriodDoc;
  prevPeriodTopUsers: CurationPeriodUser[];

  currentBlock: CurationBlockRewardsDoc;
  currentBlockTopUsers: CurationUser[];
  prevBlock: CurationBlockRewardsDoc;
  prevBlockTopUsers: CurationUser[];
}