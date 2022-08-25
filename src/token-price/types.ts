import { ChainId } from '@infinityxyz/lib/types/core';
import { ethers } from 'ethers';

export interface PoolImmutables {
  factory: string;
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  maxLiquidityPerTick: ethers.BigNumber;
}

export interface PoolState {
  liquidity: ethers.BigNumber;
  sqrtPriceX96: ethers.BigNumber;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

export interface IToken {
  chainId: ChainId;
  address: string;
  decimals: number;
  symbol: string;
  name: string;
}

export interface TokenPairType {
  poolAddress: string;

  factoryAddress: string;

  token0: IToken;
  token1: IToken;
}

export interface TokenPrice extends TokenPairType {
  token0Price: string;
  token0PriceNum: number;
  token1Price: string;
  token1PriceNum: number;
  updatedAt: number;
  blockNumber: number;
  timestamp: number;
}
