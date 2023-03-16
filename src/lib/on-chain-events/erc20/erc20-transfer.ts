import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface Erc20TransferEventData {
  from: string;
  to: string;
  value: string;
}

export class Erc20TransferEvent extends AbstractEvent<Erc20TransferEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.Erc20Transfer;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.Transfer();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 3;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): Erc20TransferEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const from = parsedLog.args.from.toLowerCase();
    const to = parsedLog.args.to.toLowerCase();
    const value = BigNumber.from(parsedLog.args.value).toString();

    return {
      from,
      to,
      value
    };
  }
}
