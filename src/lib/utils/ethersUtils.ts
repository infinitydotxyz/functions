import { ethers } from 'ethers';

import { ERC721ABI } from '@infinityxyz/lib/abi/erc721';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';

export function getProvider(chainId: string, component: 'default' | 'indexer' = 'default') {
  const comp = config.providers[component];
  if (comp == null) {
    throw new Error(`No provider for component ${component}`);
  }
  const provider = comp[chainId as keyof typeof comp];
  if (provider === null) {
    throw new Error(`No provider for chainId ${chainId}`);
  }
  return provider;
}

export async function getErc721Owner(token: { address: string; tokenId: string; chainId: string }): Promise<string> {
  const provider = getProvider(token.chainId);
  const contract = new ethers.Contract(token.address, ERC721ABI, provider);
  const owner = trimLowerCase(await contract.ownerOf(token.tokenId));
  return owner;
}
