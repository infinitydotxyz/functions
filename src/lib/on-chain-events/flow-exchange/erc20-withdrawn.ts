import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface ERC20WithdrawnEventData {
  destination: string;
  currency: string;
  amount: string;
}

export class ERC20WithdrawnEvent extends AbstractEvent<ERC20WithdrawnEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.FlowExchangeERC20WithdrawnEvent;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.ERC20Withdrawn();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 3;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): ERC20WithdrawnEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const destination = parsedLog.args.destination.toLowerCase();
    const currency = parsedLog.args.currency.toLowerCase();
    const amount = BigNumber.from(parsedLog.args.amount).toString();

    return { destination, currency, amount };
  }
}
