import { ChainId } from '@infinityxyz/lib/types/core';

export function parseSupportedChains(value: string) {
  const chains = value.split(',');

  if (chains.length === 0) {
    throw new Error('No chains found');
  }
  for (const chain of chains) {
    if (!Object.values(ChainId).includes(chain as ChainId)) {
      throw new Error(`Invalid chain ${chain}`);
    }
  }

  return chains as ChainId[];
}
