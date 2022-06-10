/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ethers } from 'ethers';
import { getWalletWithBalances } from './load-wallets';
import { WalletWithBalances } from './types';

export async function fundTestWallets(
  testWallets: WalletWithBalances[],
  fundingWallet: ethers.Wallet,
  fund: {
    amount: ethers.BigNumber;
    wethAddress: string;
  },
  provider: ethers.providers.JsonRpcProvider
): Promise<{ testWallets: WalletWithBalances[]; fundingWallet: WalletWithBalances }> {
  const fundingWalletEthBalance = await fundingWallet.getBalance();

  const testBalance = testWallets.reduce((sum, wallet) => sum.add(wallet.ethBalance), ethers.BigNumber.from(0));
  const amountToFund = fund.amount.mul(testWallets.length).sub(testBalance);
  const fundingBalance = fundingWalletEthBalance;

  console.log(`Funding wallets with ${amountToFund.toString()}`);
  console.log(`Funding wallet has ${fundingBalance.toString()}`);
  if (fundingBalance.lt(amountToFund)) {
    throw new Error(
      `Not enough funds to fund test wallets. Needed: ${amountToFund.toString()}, have: ${fundingBalance.toString()}`
    );
  }

  let nonce = await provider.getTransactionCount(fundingWallet.address);
  const txns = (
    await Promise.all(
      testWallets.map(async (wallet) => {
        const walletBalance = wallet.ethBalance;
        const amountToSend = fund.amount.sub(walletBalance);
        if (amountToSend.lte(0)) {
          return null;
        }
        const currentNonce = nonce;
        nonce += 1;
        return await fundingWallet.sendTransaction({
          to: wallet.wallet.address,
          from: fundingWallet.address,
          value: amountToSend.toString(),
          nonce: currentNonce
        });
      })
    )
  ).filter((item) => !!item);

  for (const tx of txns) {
    const res = await tx?.wait();
    if (res?.status !== 1) {
      console.log(`Failed to fund wallet: ${res?.transactionHash}`);
    }
  }

  const updatedTestWallets = await Promise.all(
    testWallets.map((item) => getWalletWithBalances(item.wallet, provider, fund.wethAddress))
  );
  const updatedWallet = await getWalletWithBalances(fundingWallet, provider, fund.wethAddress);
  return { testWallets: updatedTestWallets, fundingWallet: updatedWallet };
}
