import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface Erc20WithdrawnEventData {
  destination: string;
  currency: string;
  amount: string;
}

export class Erc20Withdrawn extends AbstractEvent<Erc20WithdrawnEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.CumulativeMerkleDistributorErc20Withdrawn;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.Erc20Withdrawn();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 1;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): Erc20WithdrawnEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const destination = parsedLog.args.destination.toLowerCase();
    const currency = parsedLog.args.currency.toLowerCase();
    const amount = BigNumber.from(parsedLog.args.amount).toString();
    return { destination, amount, currency };
  }
}
