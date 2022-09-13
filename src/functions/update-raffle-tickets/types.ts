import { ChainId, Epoch, Phase } from '@infinityxyz/lib/types/core';

export interface UserRaffleTickets {
  userAddress: string;
  numTickets: number;
  chainId: ChainId;
  stakerContractAddress: string;
  blockNumber: number;
  epoch: Epoch;
  phase: Phase;
  volumeUSDC: number;
  chanceOfWinning: number;
  rank: number;
  updatedAt: number;
}

export interface RaffleTicketPhaseDoc {
    phase: Phase,
    epoch: Epoch,
    numTickets: number,
    uniqueUsers: number,
    updatedAt: number,
    chainId: ChainId,
    stakerContractAddress: contract,
    blockNumber: phase.maxBlockNumber,
    isFinalized: !phase.isActive
  }