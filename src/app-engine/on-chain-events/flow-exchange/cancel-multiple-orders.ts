import { BigNumber, BigNumberish, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface CancelMultipleOrdersEventData {
  user: string;
  orderNonces: string[];
}

export class CancelMultipleOrdersEvent extends AbstractEvent<CancelMultipleOrdersEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.FlowExchangeCancelMultipleOrders;

  protected _getEventKind(): ContractEventKind {
    return this._eventKind;
  }

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.CancelMultipleOrders();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 2;
  }

  protected transformEvent(event: { log: Log; baseParams: BaseParams }): CancelMultipleOrdersEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const user = parsedLog.args.user.toLowerCase();
    const orderNonces = parsedLog.args.orderNonces.map((nonce: BigNumberish) => BigNumber.from(nonce).toString());

    return { user, orderNonces };
  }
}
