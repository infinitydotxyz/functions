import { ChainId, ChainNFTs, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { ethers } from 'ethers';
import { Wallet } from 'ethers/lib/ethers';
import { getExchangeAddress, getOBComplicationAddress, getTxnCurrencyAddress } from '@infinityxyz/lib/utils';
import { splitSignature } from '@ethersproject/bytes';
import { defaultAbiCoder } from '@ethersproject/abi';

const chainId = ChainId.Goerli;
const isSellOrder = true;
const numItems = 1;
const startPriceEth = 0.01;
const endPriceEth = 0.01;
const startTimeMs = Date.now();
const minBpsToSeller = 9000;
const nonce = 0;

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

// two days from now
const endTimeMs = startTimeMs + 2 * 24 * 60 * 60 * 1000;

async function createOrder() {
  const signerPrivateKey = process.env.CREATE_ORDER_PRIVATE_KEY;
  if (!signerPrivateKey) {
    throw new Error('CREATE_ORDER_PRIVATE_KEY is required');
  }
  const signer = new Wallet(signerPrivateKey);

  const startPrice = ethers.utils.parseEther(`${startPriceEth}`);
  const endPrice = ethers.utils.parseEther(`${endPriceEth}`);
  const startTime = Math.floor(startTimeMs / 1000);
  const endTime = Math.floor(endTimeMs / 1000);
  const complicationAddress = getOBComplicationAddress(chainId);
  const currencyAddress = getTxnCurrencyAddress(chainId);
  const exchangeAddress = getExchangeAddress(chainId);

  const order = {
    chainId,
    numItems,
    startPriceEth,
    endPriceEth,
    startTimeMs,
    endTimeMs,
    minBpsToSeller,
    nonce,
    execParams: {
      complicationAddress,
      currencyAddress
    },
    extraParams: {
      buyer: ''
    },
    signedOrder: {
      isSellOrder,
      signer: signer.address,
      constraints: [numItems, startPrice, endPrice, startTime, endTime, minBpsToSeller, nonce],
      nfts,
      execParams: [complicationAddress, currencyAddress],
      extraParams: '0x0000000000000000000000000000000000000000000000000000000000000000',
      sig: ''
    } as ChainOBOrder
  };

  const domain = {
    name: 'InfinityExchange',
    version: '1',
    chainId: chainId,
    verifyingContract: exchangeAddress
  };

  const types = {
    Order: [
      { name: 'isSellOrder', type: 'bool' },
      { name: 'signer', type: 'address' },
      { name: 'constraints', type: 'uint256[]' },
      { name: 'nfts', type: 'OrderItem[]' },
      { name: 'execParams', type: 'address[]' },
      { name: 'extraParams', type: 'bytes' }
    ],
    OrderItem: [
      { name: 'collection', type: 'address' },
      { name: 'tokens', type: 'TokenInfo[]' }
    ],
    TokenInfo: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'numTokens', type: 'uint256' }
    ]
  };

  const orderToSign = {
    isSellOrder: order.signedOrder.isSellOrder,
    signer: signer.address,
    constraints: order.signedOrder.constraints,
    nfts: order.signedOrder.nfts,
    execParams: order.signedOrder.execParams,
    extraParams: order.signedOrder.extraParams
  };

  const sig = await signer._signTypedData(domain, types, orderToSign);
  const splitSig = splitSignature(sig ?? '');
  const encodedSig = defaultAbiCoder.encode(['bytes32', 'bytes32', 'uint8'], [splitSig.r, splitSig.s, splitSig.v]);
  const signedOrder: ChainOBOrder = { ...orderToSign, sig: encodedSig };
  order.signedOrder = signedOrder;

  console.log(JSON.stringify(order, null, 2));

  return order;
}

void createOrder();