import { formatEther } from 'ethers/lib/utils';

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export function formatEth(wei: string | bigint | number): number {
  return parseFloat(formatEther(BigInt(wei).toString()));
}
