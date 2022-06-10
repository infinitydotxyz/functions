import { ethers } from 'ethers';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { erc20Abi } from '../../tests/abi/erc20';
import { WalletWithBalances } from './types';

export async function loadWallets(
  provider: ethers.providers.JsonRpcProvider,
  wethAddress: string
): Promise<WalletWithBalances[]> {
  const walletsDir = './wallets';
  const walletFiles = await readdir(walletsDir);

  const wallets: WalletWithBalances[] = await Promise.all(
    walletFiles.map(async (walletFileName) => {
      const walletFilePath = join(`${walletsDir}/${walletFileName}`);
      const privateKey = await readFile(walletFilePath, 'utf8');
      const wallet = new ethers.Wallet(privateKey);
      const walletWithBalances = await getWalletWithBalances(wallet, provider, wethAddress);
      return walletWithBalances;
    })
  );
  return wallets;
}

export async function getWalletWithBalances(
  wallet: ethers.Wallet,
  provider: ethers.providers.JsonRpcProvider,
  wethAddress: string
): Promise<WalletWithBalances> {
  const weth = new ethers.Contract(wethAddress, erc20Abi, provider);
  const balance = await provider.getBalance(wallet.address);
  const wethBalance = await weth.balanceOf(wallet.address);
  return { wallet, ethBalance: balance, wethBalance };
}
