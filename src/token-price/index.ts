import { ChainId, Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import { Token } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { getDb } from '../firestore';
import { TokenPairFactory } from './token-pair-factory';
import { TokenPair } from './token-pair';
import { CachedTokenPair } from './cached-token-pair';
import { getProvider } from '../utils/ethersUtils';

export async function getTokenPrice(token: Erc20TokenMetadata, blockNumber?: number) {
  const db = getDb();
  const provider = getProvider(ChainId.Mainnet);
  if (!provider) {
    throw new Error('Provider not found');
  }
  const factory = new TokenPairFactory(db, provider);
  const tokenPair = factory.create(token);
  const price = await tokenPair.getTokenPrice(blockNumber);
  const res = {
    price,
    tokenPerOther: price.token0.address === token.address ? price.token0PriceNum : price.token1PriceNum,
    otherPerToken: price.token0.address === token.address ? price.token1PriceNum : price.token0PriceNum
  };
  return res;
}

export async function getTokenPairPrice(
  _token0: Erc20TokenMetadata,
  _token1: Erc20TokenMetadata,
  blockNumber?: number
) {
  if (_token0.chainId !== ChainId.Mainnet) {
    throw new Error(`Token not yet supported ${_token0.chainId} ${_token0.address}`);
  }
  const db = getDb();
  const provider = getProvider(ChainId.Mainnet);
  if (!provider) {
    throw new Error('Provider not found');
  }
  const chainIdInt = parseInt(_token0.chainId, 10);
  const token0 = new Token(chainIdInt, _token0.address, _token0.decimals, _token0.symbol, _token0.name);
  const token1 = new Token(chainIdInt, _token1.address, _token1.decimals, _token1.symbol, _token1.name);
  const tokenPair = new TokenPair(token0, token1, provider);
  const cachedTokenPair = new CachedTokenPair(db, tokenPair);
  const price = await cachedTokenPair.getTokenPrice(blockNumber);
  const res = {
    price,
    tokenPerOther: price.token0.address === _token0.address ? price.token0PriceNum : price.token1PriceNum,
    otherPerToken: price.token0.address === _token0.address ? price.token1PriceNum : price.token0PriceNum
  };

  return {
    price: res.price,
    token1PerToken0: res.tokenPerOther,
    token0PerToken1: res.otherPerToken
  };
}
