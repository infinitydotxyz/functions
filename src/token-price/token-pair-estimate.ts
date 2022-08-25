import { ChainId } from '@infinityxyz/lib/types/core';
import { NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { Token } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { CachedTokenPair } from './cached-token-pair';
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
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'.toLowerCase();
    const ETH = NULL_ADDRESS;
    const addresses = [token0.address.toLowerCase(), token1.address.toLowerCase()];
    if (!addresses.find((item) => item === WETH || item === ETH)) {
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
    const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
    const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'.toLowerCase();
    const token0 = new Token(chainIdInt, USDC, 6, 'USDC', 'USD Coin');
    const token1 = new Token(chainIdInt, WETH, 18, 'WETH', 'Wrapped Ether');
    const tokenPair = new TokenPair(token0, token1, this._provider);
    const cachedTokenPair = new CachedTokenPair(this._db, tokenPair);
    const price = await cachedTokenPair.getTokenPrice(blockNumber);
    const dollarsPerEth = price.token1PriceNum;

    const ethPerToken = this.EST_DOLLARS_PER_TOKEN / dollarsPerEth;
    const tokenPerEth = 1 / ethPerToken;

    const isToken0WETH = [WETH, NULL_ADDRESS].includes(this._token0.address.toLowerCase());
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
