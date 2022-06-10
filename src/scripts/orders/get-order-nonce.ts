import { ethers } from 'ethers';
import * as phin from 'phin';

export async function getOrderNonce(wallet: ethers.Wallet): Promise<number> {
  const response = await phin({
    url: `http://localhost:9090/orders/${wallet.address}/nonce`,
    method: 'GET'
  });

  if (response.statusCode === 200) {
    const nonce = parseInt(response.body.toString(), 10);
    return nonce;
  }

  throw new Error(`Error while getting nonce ${response.statusCode} ${response.body.toString()}`);
}
