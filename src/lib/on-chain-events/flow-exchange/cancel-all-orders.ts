import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface CancelAllOrdersEventData {
  user: string;
  newMinNonce: string;
}

export class CancelAllOrdersEvent extends AbstractEvent<CancelAllOrdersEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.FlowExchangeCancelAllOrders;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.CancelAllOrders();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 2;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): CancelAllOrdersEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const user = parsedLog.args.user.toLowerCase();
    const newMinNonce = BigNumber.from(parsedLog.args.newMinNonce).toString();

    return { user, newMinNonce };
  }
}
