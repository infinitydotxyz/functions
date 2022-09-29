import { ChainId, UserDisplayData } from '@infinityxyz/lib/types/core';
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
