import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface Erc721TransferEventData {
  from: string;
  to: string;
  tokenId: string;
}

export class Erc721TransferEvent extends AbstractEvent<Erc721TransferEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.Erc721Transfer;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.Transfer();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 4;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): Erc721TransferEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const from = parsedLog.args.from.toLowerCase();
    const to = parsedLog.args.to.toLowerCase();
    const tokenId = BigNumber.from(parsedLog.args.tokenId).toString();

    return {
      from,
      to,
      tokenId
    };
  }
}
