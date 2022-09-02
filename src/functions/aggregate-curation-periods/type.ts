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

export interface StakerContractPeriodStats extends CurationPeriodStats {
  totalCurators: number;
  totalCuratorVotes: number;
}

export interface StakerContractPeriodDoc {
  metadata: StakerContractPeriodMetadata;
  stats: CurationPeriodStats;
}

export interface StakerContractPeriodUserStats extends CurationPeriodUserStats {
  collectionsCurated: number;
}

export interface StakerContractPeriodUserDoc {
  user: UserDisplayData;
  stats: StakerContractPeriodUserStats;
  metadata: Omit<StakerContractPeriodMetadata, 'trigger'>;
}
