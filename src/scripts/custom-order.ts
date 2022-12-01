import { ethers } from 'ethers';

import { ChainId, ChainNFTs } from '@infinityxyz/lib/types/core';

import { GWEI } from '@/lib/utils/constants';

import { postOrder } from './orders/post-order';
import { signOrder } from './orders/sign-order';

async function main() {
  const chainId = ChainId.Mainnet;
  const collection = '0x7f81858ea3b43513adfaf0a20dc7b4c6ebe72919';

  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('No private key found');
  }
  const wallet = new ethers.Wallet(privateKey);
  const nfts: ChainNFTs[] = [
    {
      collection,
      tokens: [
        {
          tokenId: '1862',
          numTokens: 1
        },
        {
          tokenId: '1169',
          numTokens: 1
        },
        {
          tokenId: '476',
          numTokens: 1
        }
      ]
    }
  ];

  const order = {
    chainId,
    isSellOrder: true,
    numItems: 3,
    startPriceEth: 0.01,
    endPriceEth: 0.01,
    startTimeMs: Date.now(),
    endTimeMs: Date.now() + 1000 * 60 * 60 * 24 * 7,
    nfts,
    maxGasPriceWei: GWEI.mul(50).toString()
  };

  console.log(`Creating ${order.isSellOrder ? 'sell' : 'buy'} order for ${wallet.address}`);

  const isProd = true;
  const baseUrl = isProd ? 'https://sv.infinity.xyz/' : `http://localhost:9090`;

  const signedOffer = await signOrder(wallet, order, baseUrl);
  await postOrder(wallet, signedOffer, baseUrl);
}
void main();
