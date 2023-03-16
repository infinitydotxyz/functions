import { Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface Erc20RemovedEventData {
  token: string;
}

export class Erc20Removed extends AbstractEvent<Erc20RemovedEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.CumulativeMerkleDistributorErc20Removed;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.Erc20Removed();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 1;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): Erc20RemovedEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const token = parsedLog.args.token.toLowerCase();
    return { token };
  }
}
