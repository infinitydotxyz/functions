import { BigNumber, ethers } from 'ethers';
import { ERC20ABI } from '@infinityxyz/lib/abi/erc20';
import { WalletWithBalances } from './types';

export async function mintTokens(
  wallet: WalletWithBalances,
  tokenAddress: string,
  payableAmount: string,
  numTokens: number
): Promise<{ tokenId: string }[]> {
  const iface = new ethers.utils.Interface(ERC20ABI);
  const mint = iface.getFunction('mint');
  const data = iface.encodeFunctionData(mint, [numTokens]);
  const nonce = await wallet.wallet.getTransactionCount();
  const tx = await wallet.wallet.sendTransaction({
    to: tokenAddress,
    value: payableAmount,
    data: data,
    from: wallet.wallet.address,
    nonce
  });

  const res = await tx.wait();
  const logs = res.logs;
  const tokens: { tokenId: string }[] = [];
  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const [, , tokenId] = parsed.args;
    parsed.name === 'Transfer' && tokens.push({ tokenId: BigNumber.from(tokenId).toString() });
  }

  return tokens;
}
