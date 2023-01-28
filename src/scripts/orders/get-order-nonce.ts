import { ethers } from 'ethers';
import { join } from 'path';
import phin from 'phin';

export async function getOrderNonce(wallet: ethers.Wallet, baseUrl: string): Promise<number> {
  const endpoint = `/orders/${wallet.address}/nonce`;
  const url = new URL(join(baseUrl, endpoint)).toString();

  const response = await phin({
    url,
    method: 'GET'
  });

  if (response.statusCode === 200) {
    const nonce = parseInt(response.body.toString(), 10);
    return nonce;
  }

  throw new Error(`Error while getting nonce ${response.statusCode} ${response.body.toString()}`);
}
