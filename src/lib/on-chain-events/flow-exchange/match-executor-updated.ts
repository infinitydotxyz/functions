import { Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface MatchExecutorUpdatedEventData {
  matchExecutor: string;
}

export class MatchExecutorUpdatedEvent extends AbstractEvent<MatchExecutorUpdatedEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.FlowExchangeMatchExecutorUpdated;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.MatchExecutorUpdated();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 2;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): MatchExecutorUpdatedEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const matchExecutor = parsedLog.args.matchExecutor.toLowerCase();

    return { matchExecutor };
  }
}
