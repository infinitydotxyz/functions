import { Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface OwnershipTransferredEventData {
  prevOwner: string;
  newOwner: string;
}

export class OwnershipTransferredEvent extends AbstractEvent<OwnershipTransferredEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.OwnableOwnershipTransferredEvent;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.OwnershipTransferred();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 3;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): OwnershipTransferredEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const prevOwner = parsedLog.args.previousOwner.toLowerCase();
    const newOwner = parsedLog.args.newOwner.toLowerCase();

    return { prevOwner, newOwner };
  }
}
