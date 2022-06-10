import { ChainId, ChainNFTs } from '@infinityxyz/lib/types/core';
import { Wallet } from 'ethers/lib/ethers';
import { signOrder } from './orders/sign-order';
import { postOrder } from './orders/post-order';



const signerPrivateKey = process.env.CREATE_ORDER_PRIVATE_KEY;
if (!signerPrivateKey) {
  throw new Error('CREATE_ORDER_PRIVATE_KEY is required');
}
const signer = new Wallet(signerPrivateKey);


const nfts: ChainNFTs[] = [
  {
    collection: '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
    tokens: [
      {
        tokenId: '9',
        numTokens: 1
      }
    ]
  }
];
const chainId = ChainId.Goerli;
const isSellOrder = false;
const numItems = 1;
const startPriceEth = 0.01;
const endPriceEth = 0.01;
const startTimeMs = Date.now();
// two days from now
const endTimeMs = startTimeMs + 2 * 24 * 60 * 60 * 1000;
const defaultOrderDescription = {
  nfts,
  chainId, 
  isSellOrder, 
  numItems,
  startPriceEth,
  endPriceEth,
  startTimeMs,
  endTimeMs
}


async function createOrder() {
  const order = await signOrder(signer, defaultOrderDescription);

  await postOrder(signer, order);
}

void createOrder();