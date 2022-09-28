import { ChainId, UserDisplayData } from '@infinityxyz/lib/types/core';
import { ONE_WEEK } from '@infinityxyz/lib/utils';
import { RaffleType } from '../../rewards/trading-fee-program-handlers/raffle-handler';

export interface RaffleRewardsLedgerTriggerDoc {
  requiresAggregation: boolean;
  updatedAt: number;
}

export interface RaffleTicketTotalsDoc {
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  chainId: ChainId;
  raffleId: string;
  type: RaffleType;
  isAggregated: boolean;
  updatedAt: number;
  totalsUpdatedAt: number;
  totalNumTickets: bigint;
  numUniqueEntrants: number;
}

export interface RaffleRewardsDoc {
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  type: RaffleType;
  raffleId: string;
  updatedAt: number;
  chainId: ChainId;
  prizePoolWei: string;
  prizePoolEth: number;
}

export enum RaffleState {
  /**
   * raffle has not started yet
   */
  Unstarted = 'UNSTARTED',
  /**
   * raffle is currently accruing the prize
   * and entrants are gaining tickets
   */
  InProgress = 'IN_PROGRESS',
  /**
   * raffle is no longer accruing prizes
   * entrants can no longer gain tickets
   * but tickets have not been finalized
   */
  Locked = 'LOCKED',
  /**
   * raffle tickets are finalized
   */
  Finalized = 'FINALIZED',
  /**
   * winner has been selected
   */
  Completed = 'COMPLETED'
}

export interface StakingContractRaffle {
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  tokenContractAddress: string;
  tokenContractChainId: ChainId;
  type: RaffleType;
  updatedAt: number;
  chainId: ChainId;
  state: RaffleState;
  raffleContractAddress: string;
  raffleContractChainId: ChainId;
  id: string;
  activePhaseIds: string[];
  activePhases: { name: string; id: string; index: number }[];
  name: string;
}

export interface UserRaffleConfig {
  listing: {
    maxPercentAboveFloor: number;
    minTimeValid: number;
    ticketMultiplier: number;
  };
  offer: {
    maxPercentBelowFloor: number;
    minTimeValid: number;
    ticketMultiplier: number;
  };
}

export interface UserRaffle extends StakingContractRaffle {
  config: UserRaffleConfig;
}

export const DEFAULT_USER_RAFFLE_CONFIG = {
  listing: {
    maxPercentAboveFloor: 5,
    minTimeValid: ONE_WEEK,
    ticketMultiplier: 100
  },
  offer: {
    maxPercentBelowFloor: 0,
    minTimeValid: ONE_WEEK,
    ticketMultiplier: 500
  }
};

export enum EntrantLedgerItemVariant {
  TransactionStats = 'TRANSACTION_STATS',
  Offer = 'OFFER',
  Listing = 'LISTING'
}

export interface EntrantLedgerItemBase {
  discriminator: EntrantLedgerItemVariant;
  chainId: ChainId;
  updatedAt: number;
  isAggregated: boolean;
  entrantAddress: string;
}

export interface EntrantFeesLedgerItem extends EntrantLedgerItemBase {
  discriminator: EntrantLedgerItemVariant.TransactionStats;
  phaseId: string;
  phaseName: string;
  phaseIndex: number;
  volumeEth: number;
  volumeWei: string;
  volumeUSDC: number;
  userSells: number;
  userBuys: number;
  protocolFeesWei: string;
  protocolFeesEth: number;
  protocolFeesUSDC: number;
}

export interface EntrantOrderItem {
  isTopCollection: boolean;
  isSellOrder: boolean;
  startTimeMs: number;
  endTimeMs: number;
  hasBlueCheck: boolean;
  collectionAddress: string;
  collectionSlug: string;
  floorPriceEth: number;
  startPriceEth: number;
  endPriceEth: number;
  tokenId: string;
  numTokens: number;
  makerAddress: string;
}

export interface EntrantOrderLedgerItem extends EntrantLedgerItemBase {
  discriminator: EntrantLedgerItemVariant.Offer | EntrantLedgerItemVariant.Listing;
  order: {
    id: string;
    chainId: ChainId;
    numItems: number;
    items: EntrantOrderItem[];
  };
  blockNumber: number;
  stakeLevel: number;
}

export type EntrantLedgerItem = EntrantFeesLedgerItem | EntrantOrderLedgerItem;

export interface RaffleEntrantBase<U, T> {
  raffleId: string;
  raffleType: RaffleType;
  numTickets: number;
  chainId: ChainId;
  entrantAddress: string;
  stakerContractAddress: string;
  updatedAt: number;
  isFinalized: boolean;
  isAggregated: boolean;
  isLedgerAggregated: boolean;
  entrant: U;
  data: T;
}

export interface UserRaffleEntrantData {
  volumeUSDC: number;
  numValidOffers: number;
  numValidListings: number;
  numTicketsFromOffers: number;
  numTicketsFromListings: number;
  numTicketsFromVolume: number;
}

export interface NonFinalizedUserRaffleEntrant extends RaffleEntrantBase<UserDisplayData, UserRaffleEntrantData> {
  isFinalized: false;
  raffleType: RaffleType.User;
}

export interface FinalizedUserRaffleEntrant extends RaffleEntrantBase<UserDisplayData, UserRaffleEntrantData> {
  raffleType: RaffleType.User;
  isFinalized: true;
  tickets: {
    start: string;
    end: string;
  };
}

export type RaffleEntrant = FinalizedUserRaffleEntrant | NonFinalizedUserRaffleEntrant;
