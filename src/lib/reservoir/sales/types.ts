import { ChainId } from '@infinityxyz/lib/types/core';

export type SyncMetadataType = 'sales';

export interface SyncMetadata {
  metadata: {
    type: SyncMetadataType;
    chainId: ChainId;
    updatedAt: number;
    isPaused: boolean;
    collection?: string;
  };
  data: {
    eventsProcessed: number;
    blockRange: {
      startTimestamp: number;
      endTimestamp: number;
      continuation?: string;
    };
  };
}
