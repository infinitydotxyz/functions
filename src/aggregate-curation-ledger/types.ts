export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  updatedAt: number;
  periodsRequireAggregation: boolean;
  currentSnippetRequiresAggregation: boolean;
}

export enum CurationPeriodState {
  NotStarted = 'NOT_STARTED',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED'
}
