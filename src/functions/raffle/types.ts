import { ChainId } from '@infinityxyz/lib/types/core';
import { RaffleType } from '../../rewards/trading-fee-program-handlers/raffle-handler';

export interface RaffleRewardsLedgerTriggerDoc {
  requiresAggregation: boolean;
  updatedAt: number;
}

export interface RaffleRewardsDoc {
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  tokenContractAddress: string;
  tokenContractChainId: ChainId;
  type: RaffleType;
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

export enum EntrantLedgerItemVariant {
  TransactionStats = 'TRANSACTION_STATS',
  Offer = 'OFFER',
  Listing = 'LISTING'
}

export interface EntrantFeesLedgerItem {
  discriminator: EntrantLedgerItemVariant;
  phaseId: string;
  phaseName: string;
  phaseIndex: number;
  chainId: ChainId;
  userAddress: string;
  volumeEth: number;
  volumeWei: string;
  volumeUSDC: number;
  updatedAt: number;
  userSells: number;
  userBuys: number;
  protocolFeesWei: string;
  protocolFeesEth: number;
  protocolFeesUSDC: number;
  isAggregated: boolean;
}
