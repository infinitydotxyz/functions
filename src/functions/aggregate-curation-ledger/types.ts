import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  periodsRequireAggregation: boolean;
  currentSnippetRequiresAggregation: boolean;
  collectionAddress: string;
  collectionChainId: ChainId;
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  tokenContractAddress: string;
  tokenContractChainId: ChainId;
  refreshCurrentSnippetBy: number;
  updatedAt: number;
}

export enum CurationPeriodState {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED'
}
