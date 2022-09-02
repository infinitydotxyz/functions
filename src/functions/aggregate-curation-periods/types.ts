import { CurationPeriodStats, CurationPeriodUserStats, UserDisplayData } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface StakerContractPeriodMetadata {
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  tokenContractAddress: string;
  tokenContractChainId: ChainId;
  timestamp: number;
  updatedAt: number;
  trigger: boolean;
  periodDuration: number;
}

export interface StakerContractPeriodStats extends Omit<CurationPeriodStats, 'periodAprByMultiplier' | 'tokenPrice' | 'avgStakePowerPerToken' | 'periodApr'> {
  totalCurators: number;
  totalCollectionsCurated: number;
}

export interface StakerContractPeriodDoc {
  metadata: StakerContractPeriodMetadata;
  stats: StakerContractPeriodStats;
}

export interface StakerContractPeriodUserStats extends Omit<CurationPeriodUserStats, 'periodApr' | 'tokenPrice'> {
  collectionsCurated: number;
}

export type StakerContractCurationPeriodUserMetadata = Omit<StakerContractPeriodMetadata, 'trigger'> & {
  userAddress: string;
  updatedAt: number;
};

export interface StakerContractPeriodUserDoc {
  user: UserDisplayData;
  stats: StakerContractPeriodUserStats;
  metadata: StakerContractCurationPeriodUserMetadata;
}
