import { ChainNFTs } from '@infinityxyz/lib/types/core/OBOrder';
import { ethers } from 'ethers';

export interface WalletWithBalances {
  wallet: ethers.Wallet;
  wethBalance: ethers.BigNumber;
  ethBalance: ethers.BigNumber;
}

export type WalletWithTokens = WalletWithBalances & { nfts: ChainNFTs[] };
