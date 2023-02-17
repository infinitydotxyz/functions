import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface WethTransferGasUnitsUpdatedData {
  wethTransferGasUnits: string;
}

export class WethTransferGasUnitsUpdated extends AbstractEvent<WethTransferGasUnitsUpdatedData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;

  protected _eventKind = ContractEventKind.FlowExchangeWethTransferGasUnitsUpdated;

  protected _getEventKind(): ContractEventKind {
    return this._eventKind;
  }

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.WethTransferGasUnitsUpdated();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 1;
  }

  protected transformEvent(event: { log: Log; baseParams: BaseParams }): WethTransferGasUnitsUpdatedData {
    const parsedLog = this._iface.parseLog(event.log);
    const wethTransferGasUnits = BigNumber.from(parsedLog.args.wethTransferGasUnits).toString();

    return { wethTransferGasUnits };
  }
}
