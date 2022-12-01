import { ethers } from 'ethers';

import { ChainNFTs } from '@infinityxyz/lib/types/core/OBOrder';

export interface WalletWithBalances {
  wallet: ethers.Wallet;
  wethBalance: ethers.BigNumber;
  ethBalance: ethers.BigNumber;
}

export type WalletWithTokens = WalletWithBalances & { nfts: ChainNFTs[] };
