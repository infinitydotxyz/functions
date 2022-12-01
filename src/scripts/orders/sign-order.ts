import { Wallet, ethers } from 'ethers';
import { defaultAbiCoder, splitSignature } from 'ethers/lib/utils';

import { ChainId, ChainNFTs, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { SignedOBOrderDto } from '@infinityxyz/lib/types/dto/orders';
import { getOBComplicationAddress, getTxnCurrencyAddress } from '@infinityxyz/lib/utils';

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
    maxGasPriceWei: string;
  },
  baseUrl: string
): Promise<SignedOBOrderDto> {
  const { nfts, chainId, isSellOrder, numItems, startPriceEth, endPriceEth, startTimeMs, endTimeMs, maxGasPriceWei } =
    orderDescription;
  const nonce = await getOrderNonce(signer, baseUrl);
  const startPrice = ethers.utils.parseEther(`${startPriceEth}`);
  const endPrice = ethers.utils.parseEther(`${endPriceEth}`);
  const startTime = Math.floor(startTimeMs / 1000);
  const endTime = Math.floor(endTimeMs / 1000);
  const complicationAddress = getOBComplicationAddress(chainId);
  const currencyAddress = getTxnCurrencyAddress(chainId);

  const order: SignedOBOrderDto = {
    chainId,
    numItems,
    startPriceEth,
    endPriceEth,
    startTimeMs,
    endTimeMs,
    nonce,
    maxGasPriceWei,
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
      constraints: [numItems, startPrice, endPrice, startTime, endTime, nonce, maxGasPriceWei],
      nfts,
      execParams: [complicationAddress, currencyAddress],
      extraParams: '0x0000000000000000000000000000000000000000000000000000000000000000',
      sig: ''
    } as ChainOBOrder,
    id: '',
    isSellOrder,
    makerUsername: '',
    makerAddress: signer.address.toLowerCase(),
    nfts: []
  };

  const domain = {
    name: 'InfinityComplication',
    version: '1',
    chainId: chainId,
    verifyingContract: complicationAddress
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

  const orderToSign: Omit<ChainOBOrder, 'sig'> = {
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
