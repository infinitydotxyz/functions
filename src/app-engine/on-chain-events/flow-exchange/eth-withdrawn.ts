import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface ETHWithdrawnEventData {
  destination: string;
  amount: string;
}

export class ETHWithdrawnEvent extends AbstractEvent<ETHWithdrawnEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.FlowExchangeETHWithdrawnEvent;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.ETHWithdrawn();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 2;
  }

  protected transformEvent(event: { log: Log; baseParams: BaseParams }): ETHWithdrawnEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const destination = parsedLog.args.destination.toLowerCase();
    const amount = BigNumber.from(parsedLog.args.amount).toString();

    return { destination, amount };
  }
}
