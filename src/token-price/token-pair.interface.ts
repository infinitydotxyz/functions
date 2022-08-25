import { TokenPairType, TokenPrice } from './types';

export interface TokenPair {
  tokenPair: TokenPairType;

  getTokenPrice(blockNumber?: number): Promise<TokenPrice>;
}
