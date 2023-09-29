import { ChainId } from '@infinityxyz/lib/types/core';

export function parseSupportedChains(value: string) {
  const chains = value.split(',');

  if (chains.length === 0) {
    throw new Error('No chains found');
  }

  return chains as ChainId[];
}
