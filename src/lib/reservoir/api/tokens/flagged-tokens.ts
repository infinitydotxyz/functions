import { ChainId } from '@infinityxyz/lib/types/core';

import { ReservoirClient } from '../get-client';
import { FlaggedTokenEvent } from './types';

export interface FlaggedTokensOptions {
  flagStatus: -1 | 0 | 1;
  limit: number;
  continuation?: string;
}

export async function getFlaggedTokens(client: ReservoirClient, _options: Partial<FlaggedTokensOptions>) {
  const options: FlaggedTokensOptions = {
    limit: 100,
    flagStatus: -1,
    ..._options
  };

  const response = await client(
    '/tokens/flag/changes/v1',
    'get'
  )({
    query: {
      ...options
    }
  });

  const events: FlaggedTokenEvent[] = (response.data.tokens ?? []).map((item) => {
    if (!item.tokenId || !item.contract || !item.lastFlagChange || item.isFlagged == null) {
      throw new Error('Invalid response from reservoir');
    }

    return {
      chainId: response.chainId as ChainId,
      tokenId: item.tokenId,
      collectionAddress: item.contract.toLowerCase(),
      lastFlagChange: new Date(item.lastFlagChange).getTime(),
      isFlagged: item.isFlagged
    };
  });
  return {
    continuation: response.data.continuation,
    data: events
  };
}
