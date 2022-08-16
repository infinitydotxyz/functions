import { ChainId } from '@infinityxyz/lib/types/core';
import { ethers } from 'ethers';
import { getDb } from '../firestore';
import { TokenPairFactory } from './token-pair-factory';

export async function getTokenPrice(
  tokenAddress: string,
  tokenChainId: ChainId,
  decimals: number,
  symbol: string,
  name: string,
  blockNumber?: number
) {
  const db = getDb();
  const providerUrl = process.env.PROVIDER_URL_MAINNET;
  const provider = new ethers.providers.JsonRpcProvider(providerUrl, 1);
  const factory = new TokenPairFactory(db, provider);
  const tokenPair = factory.create(tokenAddress, tokenChainId, decimals, symbol, name);
  const price = await tokenPair.getTokenPrice(blockNumber);

  const res = {
    price,
    relevantTokenPrice: price.token0.address === tokenAddress ? price.token0PriceNum : price.token1PriceNum
  };
  return res;
}

// const addr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
// void getTokenPrice(addr, ChainId.Mainnet, 6, 'USDC', 'USD Coin', 15259747);
