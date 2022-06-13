import { ChainNFTs, ChainId, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { CreateOrderDto } from '@infinityxyz/lib/types/dto/orders';
import { getOBComplicationAddress, getTxnCurrencyAddress, getExchangeAddress } from '@infinityxyz/lib/utils';
import { Wallet, ethers } from 'ethers';
import { splitSignature, defaultAbiCoder } from 'ethers/lib/utils';
import { getOrderNonce } from './get-order-nonce';

export async function signOrder(
  signer: Wallet,
  orderDescription: {
    nfts: ChainNFTs[];
    chainId: ChainId;
    isSellOrder: boolean;
    numItems: number;
    startPriceEth: number;
    endPriceEth: number;
    startTimeMs: number;
    endTimeMs: number;
  }
): Promise<CreateOrderDto> {
  const { nfts, chainId, isSellOrder, numItems, startPriceEth, endPriceEth, startTimeMs, endTimeMs } = orderDescription;
  const minBpsToSeller = 9000;
  const nonce = await getOrderNonce(signer);
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

  return order;
}
