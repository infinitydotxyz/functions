import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_HOUR } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';

import { getProvider } from '../utils/ethersUtils';

export async function getBlockTimestamp(chainId: ChainId, blockNumber: number) {
  const provider = getProvider(chainId);

  const key = `chain:${chainId}:block:${blockNumber}:timestamp:cache`;
  const timestampStr = await redis.get(key);

  if (timestampStr) {
    return parseInt(timestampStr, 10);
  }

  const block = await provider.getBlock(blockNumber);
  await redis.set(key, block.timestamp, 'PX', ONE_HOUR);
  return block.timestamp;
}
