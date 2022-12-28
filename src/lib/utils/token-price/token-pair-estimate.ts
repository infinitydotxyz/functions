import { ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';
import { NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { Token } from '@uniswap/sdk-core';

import { CachedTokenPair } from './cached-token-pair';
import { USDC_MAINNET, WETH_MAINNET } from './constants';
import { TokenPair } from './token-pair';
import { TokenPair as AbstractTokenPair } from './token-pair.abstract';
import { TokenPairType, TokenPrice } from './types';

export class TokenPairEstimate extends AbstractTokenPair {
  protected _token0: Token;
  protected _token1: Token;
  protected _flipTokens: boolean;

  constructor(
    protected _db: FirebaseFirestore.Firestore,
    token0: Token,
    token1: Token,
    protected _provider: ethers.providers.JsonRpcProvider,
    public readonly EST_DOLLARS_PER_TOKEN: number
  ) {
    super(token0, token1);
    const ETH = NULL_ADDRESS;
    const addresses = [token0.address.toLowerCase(), token1.address.toLowerCase()];
    if (!addresses.find((item) => item === WETH_MAINNET.address || item === ETH)) {
      throw new Error('TokenPairEstimate requires estimate to be relative to WETH or ETH');
    }
  }

  get tokenPair(): TokenPairType {
    return {
      poolAddress: NULL_ADDRESS,
      factoryAddress: NULL_ADDRESS,
      ...this.tokens
    };
  }

  public async getTokenPrice(blockNumber?: number): Promise<TokenPrice> {
    const chainIdInt = parseInt(ChainId.Mainnet, 10);
    const token0 = new Token(
      chainIdInt,
      USDC_MAINNET.address,
      USDC_MAINNET.decimals,
      USDC_MAINNET.symbol,
      USDC_MAINNET.name
    );
    const token1 = new Token(
      chainIdInt,
      WETH_MAINNET.address,
      WETH_MAINNET.decimals,
      WETH_MAINNET.symbol,
      WETH_MAINNET.name
    );
    const tokenPair = new TokenPair(token0, token1, this._provider);
    const cachedTokenPair = new CachedTokenPair(this._db, tokenPair);
    const price = await cachedTokenPair.getTokenPrice(blockNumber);
    const dollarsPerEth = price.token1PriceNum;

    const ethPerToken = this.EST_DOLLARS_PER_TOKEN / dollarsPerEth;
    const tokenPerEth = 1 / ethPerToken;

    const isToken0WETH = [WETH_MAINNET.address, NULL_ADDRESS].includes(this._token0.address.toLowerCase());
    const [token0PriceNum, token1PriceNum] = isToken0WETH ? [tokenPerEth, ethPerToken] : [ethPerToken, tokenPerEth];

    const prices = {
      token0Price: token0PriceNum.toString(),
      token0PriceNum: token0PriceNum,
      token1Price: token1PriceNum.toString(),
      token1PriceNum: token1PriceNum,
      updatedAt: price.updatedAt,
      blockNumber: price.blockNumber,
      timestamp: price.timestamp
    };

    return {
      ...this.tokenPair,
      ...prices
    };
  }
}
