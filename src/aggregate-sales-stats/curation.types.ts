import { ChainId, ProtocolFeeStats } from '@infinityxyz/lib/types/core';
import { InfinityNftSale } from '@infinityxyz/lib/types/core/NftSale';

export enum CurationLedgerEvent {
  Sale = 'sale',
  VotesAdded = 'votesAdded',
  VotesRemoved = 'votesRemoved'
}

export const curationLedgerEventPriority = {
  [CurationLedgerEvent.VotesRemoved]: 1,
  [CurationLedgerEvent.Sale]: 10,
  [CurationLedgerEvent.VotesAdded]: 100
};

export type CurationLedgerEventType = {
  discriminator: CurationLedgerEvent;
  blockNumber: number;
  timestamp: number;
  updatedAt: number;
  isAggregated: boolean;
  isDeleted: boolean;
  address: string;
  chainId: ChainId;
};

export interface CurationLedgerSale extends InfinityNftSale, CurationLedgerEventType {
  docId: string;
  chainId: ChainId;
  discriminator: CurationLedgerEvent.Sale;
}

export interface CurationVotesAdded extends CurationLedgerEventType {
  votes: number;
  userAddress: string;
  discriminator: CurationLedgerEvent.VotesAdded;
}

export interface CurationVotesRemoved extends CurationLedgerEventType {
  votes: number;
  userAddress: string;
  discriminator: CurationLedgerEvent.VotesRemoved;
}

export interface CurationPeriod {
  startTimestamp: number;
  endTimestamp: number;
  hasUnaggregatedEvents: boolean;
  updatedAt: number;
  isAggregated: boolean;
  numCurators: number;
  numCuratorVotes: number;
  protocolFees: ProtocolFeeStats;
}
