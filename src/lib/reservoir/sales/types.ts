export type SyncMetadataType = 'sales';

export interface SyncMetadata {
  metadata: {
    type: SyncMetadataType;
    chainId: string;
    updatedAt: number;
  };
  data: {
    eventsProcessed: number;
    lastItemProcessed: string;
    endTimestamp: number;
  };
}
