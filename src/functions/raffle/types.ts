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
  phaseName: string;
  phaseId: string;
  phaseIndex: number;
  prizePoolWei: string;
  prizePoolEth: number;
}
