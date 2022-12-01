import { ethers } from 'ethers';
import { join } from 'path';
import phin from 'phin';

import { getAuthHeaders } from './get-auth-headers';

export async function getOrderNonce(wallet: ethers.Wallet, baseUrl: string): Promise<number> {
  const headers = await getAuthHeaders(wallet);
  const endpoint = `/orders/${wallet.address}/nonce`;
  const url = new URL(join(baseUrl, endpoint)).toString();

  const response = await phin({
    url,
    method: 'GET',
    headers
  });

  if (response.statusCode === 200) {
    const nonce = parseInt(response.body.toString(), 10);
    return nonce;
  }

  throw new Error(`Error while getting nonce ${response.statusCode} ${response.body.toString()}`);
}
