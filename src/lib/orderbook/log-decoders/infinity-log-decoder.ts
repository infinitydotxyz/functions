import { BigNumber, ethers } from 'ethers';

import { ChainId, ChainNFTs, SaleSource, TokenStandard } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import { MatchOrderEvent, TakeOrderEvent } from './types';

export class InfinityLogDecoder {
  constructor(public contract: ethers.Contract, public chainId: ChainId) {}

  decodeMatchOrderEvent(log: ethers.providers.Log): MatchOrderEvent | null {
    if (!log) {
      return null;
    }
    let event;
    try {
      event = this.contract.interface.parseLog(log);
    } catch (err) {
      return null;
    }
    const eventData = event.args;
    if (eventData?.length !== 8) {
      return null;
    }
    const sellOrderHash = String(eventData[0]);
    const buyOrderHash = String(eventData[1]);
    const seller = trimLowerCase(String(eventData[2]));
    const buyer = trimLowerCase(String(eventData[3]));
    const complication = trimLowerCase(String(eventData[4]));
    const currency = trimLowerCase(String(eventData[5]));
    const amount = BigNumber.from(eventData[6]);
    const nfts = eventData[7];

    let quantity = 0;
    const orderItems: ChainNFTs[] = [];

    for (const orderItem of nfts) {
      const [_address, tokens] = orderItem;
      const tokenInfos = [];
      for (const token of tokens) {
        const [_tokenId, _numTokens] = token as [string, string];
        const tokenId = BigNumber.from(_tokenId).toString();
        const numTokens = BigNumber.from(_numTokens).toNumber();
        const tokenInfo = {
          tokenId,
          numTokens
        };
        tokenInfos.push(tokenInfo);
        quantity += numTokens;
      }

      const address = trimLowerCase(String(_address));
      const chainNFT: ChainNFTs = {
        collection: address,
        tokens: tokenInfos
      };
      orderItems.push(chainNFT);
    }

    const txHash = log.transactionHash;
    const price = amount.toBigInt();

    const res: MatchOrderEvent = {
      chainId: ChainId.Mainnet,
      txHash,
      price: price,
      transactionIndex: log.transactionIndex,
      complication,
      paymentToken: currency,
      quantity,
      source: SaleSource.Infinity,
      tokenStandard: TokenStandard.ERC721,
      seller,
      buyer,
      orderItems,
      buyOrderHash,
      sellOrderHash
    };
    return res;
  }

  decodeTakeOrderEvent(log: ethers.providers.Log): TakeOrderEvent | null {
    if (!log) {
      return null;
    }
    let event;
    try {
      event = this.contract.interface.parseLog(log);
    } catch (err) {
      return null;
    }
    const eventData = event.args;
    if (eventData?.length !== 7) {
      return null;
    }
    const orderHash = String(eventData[0]);
    const seller = trimLowerCase(String(eventData[1]));
    const buyer = trimLowerCase(String(eventData[2]));
    const complication = trimLowerCase(String(eventData[3]));
    const currency = trimLowerCase(String(eventData[4]));
    const amount = BigNumber.from(eventData[5]);
    const nfts = eventData[6];

    let quantity = 0;
    const orderItems: ChainNFTs[] = [];

    for (const orderItem of nfts) {
      const [_address, tokens] = orderItem;
      const tokenInfos = [];
      for (const token of tokens) {
        const [_tokenId, _numTokens] = token as [string, string];
        const tokenId = BigNumber.from(_tokenId).toString();
        const numTokens = BigNumber.from(_numTokens).toNumber();
        const tokenInfo = {
          tokenId,
          numTokens
        };
        tokenInfos.push(tokenInfo);
        quantity += numTokens;
      }

      const address = trimLowerCase(String(_address));
      const chainNFT: ChainNFTs = {
        collection: address,
        tokens: tokenInfos
      };
      orderItems.push(chainNFT);
    }
    const price = amount.toBigInt();

    const txHash = log.transactionHash;
    const res: TakeOrderEvent = {
      chainId: ChainId.Mainnet,
      txHash,
      price: price,
      complication,
      transactionIndex: log.transactionIndex,
      paymentToken: currency,
      quantity,
      source: SaleSource.Infinity,
      tokenStandard: TokenStandard.ERC721,
      seller,
      buyer,
      orderItems,
      orderHash
    };
    return res;
  }
}
