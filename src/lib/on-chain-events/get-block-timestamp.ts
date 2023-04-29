import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_HOUR } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';

import { logger } from '../logger';
import { getProvider } from '../utils/ethersUtils';

export async function getBlockTimestamp(chainId: ChainId, blockNumber: number) {
  const provider = getProvider(chainId, 'indexer');

  const key = `chain:${chainId}:block:${blockNumber}:timestamp:cache`;
  const timestampStr = await redis.get(key);

  if (timestampStr) {
    return parseInt(timestampStr, 10);
  }

  const attempt = 0;
  let error;
  while (attempt < 5) {
    try {
      const block = await provider.getBlock(blockNumber);
      await redis.set(key, block.timestamp, 'PX', ONE_HOUR);
      return block.timestamp;
    } catch (err) {
      logger.warn(`get-block-timestamp`, `Failed to get block ${chainId} ${blockNumber} Attempt ${attempt} ${err}`);
      error = err;
    }
  }
  throw error;
}
