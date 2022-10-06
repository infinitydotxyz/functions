import { Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { Env, ETHEREUM_TOKEN_CONTRACT_ADDRESS, ETHEREUM_TOKEN_CONTRACT_ADDRESS_TEST, getTokenAddress } from '@infinityxyz/lib/utils';
import { Token } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { CachedTokenPair } from './cached-token-pair';
import { WETH_MAINNET } from './constants';
import { TokenPair } from './token-pair';
import { TokenPairEstimate } from './token-pair-estimate';
import { TokenPair as ITokenPair } from './token-pair.interface';

export class TokenPairFactory {
  constructor(
    protected _db: FirebaseFirestore.Firestore,
    protected _mainnetProvider: ethers.providers.JsonRpcProvider | ethers.providers.StaticJsonRpcProvider
  ) {}

  static readonly EST_DOLLARS_PER_NFT = 0.07;

  public create(token: Erc20TokenMetadata): ITokenPair {
    const goerliToken = getTokenAddress(ChainId.Goerli);
    const mainnetTokenDev = ETHEREUM_TOKEN_CONTRACT_ADDRESS_TEST
    const mainnetTokenProd = ETHEREUM_TOKEN_CONTRACT_ADDRESS
    
    const chainIdInt = parseInt(token.chainId, 10);
    const wethToken = new Token(
      parseInt(ChainId.Mainnet, 10),
      WETH_MAINNET.address,
      WETH_MAINNET.decimals,
      WETH_MAINNET.symbol,
      WETH_MAINNET.name
    );
    switch (token.address) {
      case goerliToken:
      case mainnetTokenDev:
      case mainnetTokenProd: {
        const token0 = new Token(chainIdInt, token.address, token.decimals, token.symbol, token.name);
        const tokenPair = new TokenPairEstimate(
          this._db,
          token0,
          wethToken,
          this._mainnetProvider,
          TokenPairFactory.EST_DOLLARS_PER_NFT
        );
        const cachedTokenPair = new CachedTokenPair(this._db, tokenPair);
        return cachedTokenPair;
      }
      default: {
        if (token.chainId !== ChainId.Mainnet) {
          throw new Error(`Token not yet supported ${token.chainId} ${token.address}`);
        }
        const token0 = new Token(chainIdInt, token.address, token.decimals, token.symbol, token.name);
        const tokenPair = new TokenPair(token0, wethToken, this._mainnetProvider);
        const cachedTokenPair = new CachedTokenPair(this._db, tokenPair);
        return cachedTokenPair;
      }
    }
  }
}
