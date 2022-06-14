import { ethers } from 'ethers';
import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { erc20Abi } from '../../tests/abi/erc20';
import { WalletWithBalances } from './types';

export async function loadWallets(
  provider: ethers.providers.JsonRpcProvider,
  wethAddress: string,
  numWallets: number
): Promise<WalletWithBalances[]> {
  const walletsDir = './wallets';
  const walletFiles = await readdir(walletsDir);

  const existingWallets: ethers.Wallet[] = await Promise.all(
    walletFiles.map(async (walletFileName) => {
      const walletFilePath = join(`${walletsDir}/${walletFileName}`);
      const privateKey = await readFile(walletFilePath, 'utf8');
      const wallet = new ethers.Wallet(privateKey, provider);
      return wallet;
    })
  );

  const walletsToCreate = numWallets - existingWallets.length;
  const items = walletsToCreate > 0 ? [...Array(walletsToCreate).keys()] : [];
  const newWallets: ethers.Wallet[] = await Promise.all(items.map(async () => {
    const wallet = ethers.Wallet.createRandom();
    await writeFile(join(`${walletsDir}/${wallet.address.toLowerCase()}.txt`), wallet.privateKey);
    return wallet;
  }));

  const wallets = [...existingWallets, ...newWallets].splice(0, numWallets);
  return await Promise.all(wallets.map(async (wallet) => {
    const walletWithBalances = await getWalletWithBalances(wallet, provider, wethAddress);
    return walletWithBalances;
  }));
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
