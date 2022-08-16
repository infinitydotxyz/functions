import { computePoolAddress } from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import { Price, Token } from '@uniswap/sdk-core';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import { PoolImmutables, PoolState, TokenPairType, TokenPrice } from './types';
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
    console.log(`Getting token price from pool at block ${block.number}`);
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
    const [state] = await Promise.all([this._getPoolState(blockNumber)]);
    const price = state.sqrtPriceX96;
    console.log({ price: price.toString() });
    const token0Price = this.getToken0Price(JSBI.BigInt(price.toString()));

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

  protected async _getPoolImmutables(blockNumber?: number) {
    const functions = [
      this._poolContract.functions.factory,
      this._poolContract.functions.token0,
      this._poolContract.functions.token1,
      this._poolContract.functions.fee,
      this._poolContract.functions.tickSpacing,
      this._poolContract.functions.maxLiquidityPerTick
    ];

    const promises = functions.map((fn) => {
      if (typeof blockNumber === 'number' && !Number.isNaN(blockNumber)) {
        return fn({ blockTag: blockNumber });
      }
      return fn();
    });
    const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] = await Promise.all(promises);

    const immutables: PoolImmutables = {
      factory,
      token0,
      token1,
      fee,
      tickSpacing,
      maxLiquidityPerTick
    };
    return immutables;
  }

  protected async _getPoolState(blockNumber?: number) {
    const functions = [this._poolContract.functions.liquidity, this._poolContract.functions.slot0];
    const promises = functions.map((fn) => {
      if (typeof blockNumber === 'number' && !Number.isNaN(blockNumber)) {
        return fn({ blockTag: blockNumber });
      }
      return fn();
    });

    const [liquidity, slot] = await Promise.all(promises);

    const PoolState: PoolState = {
      liquidity,
      sqrtPriceX96: slot[0],
      tick: slot[1],
      observationIndex: slot[2],
      observationCardinality: slot[3],
      observationCardinalityNext: slot[4],
      feeProtocol: slot[5],
      unlocked: slot[6]
    };

    return PoolState;
  }
}
