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
