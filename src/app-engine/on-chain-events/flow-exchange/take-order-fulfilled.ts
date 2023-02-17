import { BigNumber, BigNumberish, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId, ChainNFTs } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface TakeOrderFulfilledEventData {
  orderHash: string;
  seller: string;
  buyer: string;
  complication: string;
  currency: string;
  amount: string;
  nfts: ChainNFTs[];
}

export class TakeOrderFulfilledEvent extends AbstractEvent<TakeOrderFulfilledEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind: ContractEventKind.FlowExchangeTakeOrderFulfilled;

  constructor(chainId: ChainId, contract: Contract, addresses: string[], db: FirebaseFirestore.Firestore) {
    super(chainId, addresses, contract.interface, db);
    const event = contract.filters.TakeOrderFulfilled();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = this._topics.length;
  }

  protected transformEvent(event: { log: Log; baseParams: BaseParams }): TakeOrderFulfilledEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const orderHash = parsedLog.args.orderHash.toLowerCase();
    const seller = parsedLog.args.seller.toLowerCase();
    const buyer = parsedLog.args.buyer.toLowerCase();
    const complication = parsedLog.args.complication.toLowerCase();
    const currency = parsedLog.args.currency.toLowerCase();
    const amount = BigNumber.from(parsedLog.args.amount).toString();
    const nftsPreNormalization = parsedLog.args.nfts as {
      collection: string;
      tokens: {
        tokenId: BigNumberish;
        numTokens: BigNumberish;
      }[];
    }[];

    const nfts: ChainNFTs[] = nftsPreNormalization.map((nft) => {
      return {
        collection: nft.collection.toLowerCase(),
        tokens: nft.tokens.map((token) => ({
          tokenId: BigNumber.from(token.tokenId).toString(),
          numTokens: BigNumber.from(token.numTokens).toNumber()
        }))
      };
    });

    return { orderHash, seller, buyer, complication, currency, amount, nfts };
  }
}
