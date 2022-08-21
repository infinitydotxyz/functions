import { Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  periodsRequireAggregation: boolean;
  currentSnippetRequiresAggregation: boolean;
  collectionAddress: string;
  collectionChainId: ChainId;
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  token: Erc20TokenMetadata;
  refreshCurrentSnippetBy: number;
  updatedAt: number;
}

export enum CurationPeriodState {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED'
}
