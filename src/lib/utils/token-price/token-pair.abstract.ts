import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { Token } from '@uniswap/sdk-core';

import { TokenPair as ITokenPair } from './token-pair.interface';
import { TokenPairType, TokenPrice } from './types';

export abstract class TokenPair implements ITokenPair {
  protected _token0: Token;
  protected _token1: Token;
  protected _flipTokens: boolean;

  public get token0() {
    return this._token0;
  }

  public get token1() {
    return this._token1;
  }

  constructor(token0: Token, token1: Token) {
    const [tokenZero, tokenOne] = [token0, token1].sort((a, b) =>
      a.address.toLowerCase() > b.address.toLowerCase() ? 1 : -1
    );
    this._token0 = tokenZero;
    this._token1 = tokenOne;
    this._flipTokens = this._token0.address.toLowerCase() !== token0.address.toLowerCase();
  }

  abstract tokenPair: TokenPairType;

  abstract getTokenPrice(blockNumber?: number): Promise<TokenPrice>;

  get tokens() {
    const _token0 = {
      chainId: `${this._token0.chainId}` as ChainId,
      address: this._token0.address.toLowerCase(),
      decimals: this._token0.decimals,
      symbol: this._token0.symbol ?? '',
      name: this._token0.name ?? ''
    };
    const _token1 = {
      chainId: `${this._token1.chainId}` as ChainId,
      address: this._token1.address.toLowerCase(),
      decimals: this._token1.decimals,
      symbol: this._token1.symbol ?? '',
      name: this._token1.name ?? ''
    };
    const [token0, token1] = this._flipTokens ? [_token1, _token0] : [_token0, _token1];

    return {
      token0,
      token1
    };
  }
}
