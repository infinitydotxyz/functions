import { ethers } from 'ethers';
import { join } from 'path';
import phin from 'phin';

import { SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders';

import { getAuthHeaders } from './get-auth-headers';

export async function postOrder(signer: ethers.Wallet, order: SignedOBOrderDto, baseUrl: string) {
  const authHeaders = await getAuthHeaders(signer);
  const endpoint = `/orders`;
  const url = new URL(join(baseUrl, endpoint)).toString();

  const response = await phin({
    url,
    method: 'POST',
    data: {
      orders: [order]
    },
    headers: authHeaders
  });

  if (response.statusCode === 201) {
    console.log(
      `${order.signedOrder.isSellOrder ? 'Sell' : 'Buy'} order created for wallet ${signer.address} successfully`
    );
    return;
  }
  console.log(`Error creating order: ${response.statusCode} ${response.body.toString()}`);
}
