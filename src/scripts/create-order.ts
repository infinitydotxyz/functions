import { ChainId, ChainNFTs } from '@infinityxyz/lib/types/core';
import { Wallet } from 'ethers/lib/ethers';
import { signOrder } from './orders/sign-order';
import { postOrder } from './orders/post-order';
import { parseEther } from 'ethers/lib/utils';

const signerPrivateKey = process.env.CREATE_ORDER_PRIVATE_KEY;
if (!signerPrivateKey) {
  throw new Error('CREATE_ORDER_PRIVATE_KEY is required');
}
const signer = new Wallet(signerPrivateKey);

const nfts: ChainNFTs[] = [
  {
    collection: '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
    tokens: [
      // {
      //   tokenId: '175',
      //   numTokens: 1
      // },
      {
        tokenId: '174',
        numTokens: 1
      }
    ]
  }
];
const chainId = ChainId.Goerli;
const isSellOrder = false;
const numItems = 1;
const startPriceEth = 0.1;
const endPriceEth = 0.1;
const startTimeMs = Date.now();
const maxGasPriceWei = parseEther('1').toString();
console.log(`max gas price: ${maxGasPriceWei}`);
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
  endTimeMs,
  maxGasPriceWei
};

async function createOrder() {
  const baseUrl = 'http://localhost:9090';
  const order = await signOrder(signer, defaultOrderDescription, baseUrl);

  await postOrder(signer, order, baseUrl);
}

void createOrder();
