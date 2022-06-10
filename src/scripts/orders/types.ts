import { ethers } from "ethers";

export interface WalletWithBalances {
  wallet: ethers.Wallet;
  wethBalance: ethers.BigNumber;
  ethBalance: ethers.BigNumber;
}
