import { computePoolAddress } from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import { Price, Token } from '@uniswap/sdk-core';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import { TokenPairType, TokenPrice } from './types';
import { TokenPair as AbstractTokenPair } from './token-pair.abstract';
import JSBI from 'jsbi';

export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
export const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2));

export class TokenPair extends AbstractTokenPair {
  protected static _POOL_FEE = 3000;
  protected static _FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984'.toLowerCase();
  protected _poolContract: ethers.Contract;
  protected _poolAddress: string;

  constructor(token0: Token, token1: Token, protected _provider: ethers.providers.JsonRpcProvider) {
    super(token0, token1);
    this._poolAddress = this._poolContractAddress;
    this._poolContract = new ethers.Contract(this._poolAddress, IUniswapV3PoolABI, this._provider);
  }

  protected get _poolContractAddress() {
    const poolAddress = computePoolAddress({
      factoryAddress: TokenPair._FACTORY_ADDRESS,
      tokenA: this._token0,
      tokenB: this._token1,
      fee: TokenPair._POOL_FEE
    });
    return poolAddress;
  }

  get tokenPair(): TokenPairType {
    return {
      poolAddress: this._poolAddress,
      factoryAddress: TokenPair._FACTORY_ADDRESS,
      ...this.tokens
    };
  }

  public async getTokenPrice(blockNumber?: number): Promise<TokenPrice> {
    return await this._getTokenPriceFromPool(blockNumber);
  }

  protected async _getTokenPriceFromPool(blockNumber?: number): Promise<TokenPrice> {
    const block = await this._provider.getBlock(blockNumber ?? 'latest');
    const prices = await this._getTokenPrices(block.number);
    return {
      ...this.tokenPair,
      ...prices,
      timestamp: block.timestamp * 1000,
      blockNumber: block.number,
      updatedAt: Date.now()
    };
  }

  protected async _getTokenPrices(blockNumber?: number) {
    const { token0Price, token1Price } = await this._getPrices(blockNumber);
    const _token0Price = token0Price.toFixed(this._token0.decimals);
    const _token0PriceNum = parseFloat(_token0Price);
    const _token1Price = token1Price.toFixed(this._token1.decimals);
    const _token1PriceNum = parseFloat(_token1Price);
    return this._flipTokens
      ? {
          token0Price: _token1Price,
          token0PriceNum: _token1PriceNum,
          token1Price: _token0Price,
          token1PriceNum: _token0PriceNum
        }
      : {
          token0Price: _token0Price,
          token0PriceNum: _token0PriceNum,
          token1Price: _token1Price,
          token1PriceNum: _token1PriceNum
        };
  }

  protected async _getPrices(
    blockNumber?: number
  ): Promise<{ token0Price: Price<Token, Token>; token1Price: Price<Token, Token> }> {
    const sqrtPriceX96 = await this._getSqrtPriceX96(blockNumber);
    const token0Price = this.getToken0Price(JSBI.BigInt(sqrtPriceX96.toString()));
    const token1Price = token0Price.invert();

    return {
      token0Price,
      token1Price
    };
  }

  public getToken0Price(sqrtRatioX96: JSBI): Price<Token, Token> {
    const token0Price = new Price(
      this.token0,
      this.token1,
      Q192.toString(),
      JSBI.multiply(sqrtRatioX96, sqrtRatioX96).toString()
    );
    return token0Price;
  }

  protected async _getSqrtPriceX96(blockNumber?: number): Promise<JSBI> {
    const fn = this._poolContract.functions.slot0;
    let slot;
    if (typeof blockNumber === 'number' && !Number.isNaN(blockNumber)) {
      slot = await fn({ blockTag: blockNumber });
    } else {
      slot = await fn();
    }

    const sqrtPriceX96 = await slot[0];
    return sqrtPriceX96;
  }
}
