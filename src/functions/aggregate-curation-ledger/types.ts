import { ChainId } from '@infinityxyz/lib/types/core/ChainId';

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  updatedAt: number;
  periodsRequireAggregation: boolean;
  currentSnippetRequiresAggregation: boolean;
  collectionAddress: string;
  collectionChainId: ChainId;
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
}

export enum CurationPeriodState {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED'
}
