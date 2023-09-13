export interface SyncMetadata {
  metadata: {
    type: 'ask' | 'bid';
    chainId: string;
    updatedAt: number;
  };
  data: {
    continuation: string;
    startTimestamp: number;
    mostRecentEventId: string;
  };
}
