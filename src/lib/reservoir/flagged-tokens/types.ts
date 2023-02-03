import { ChainId } from '@infinityxyz/lib/types/core';

import { FlaggedTokenEvent } from '../api/tokens/types';

export type SyncMetadataType = 'flagged-tokens';

export interface SyncMetadata {
  metadata: {
    type: SyncMetadataType;
    chainId: ChainId;
    updatedAt: number;
    isPaused: boolean;
  };
  data: {
    eventsProcessed: number;
    mostRecentItem: FlaggedTokenEvent | null;
  };
}
