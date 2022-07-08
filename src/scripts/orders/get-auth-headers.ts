import { ethers } from 'ethers';
import { splitSignature } from 'ethers/lib/utils';

const base64Encode = (data: string) => Buffer.from(data).toString('base64');

export async function getAuthHeaders(signer: ethers.Wallet) {
  const nonce = Date.now();
  const msg = `Welcome to Infinity. Click "Sign" to sign in. No password needed. This request will not trigger a blockchain transaction or cost any gas fees.
 
I accept the Infinity Terms of Service: https://infinity.xyz/terms

Nonce: ${nonce}
Expires in: 24 hrs`;

  const res = await signer.signMessage(msg);
  const sig = splitSignature(res);
  return {
    'x-auth-nonce': nonce.toString(),
    'x-auth-signature': JSON.stringify(sig),
    'x-auth-message': base64Encode(msg)
  };
}
