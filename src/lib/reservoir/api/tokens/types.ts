import { ChainId } from '@infinityxyz/lib/types/core';

export interface FlaggedTokenEvent {
  tokenId: string;
  lastFlagChange: number;
  isFlagged: boolean;
  collectionAddress: string;
  chainId: ChainId;
}
