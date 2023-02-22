import { Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface EthMerkleRootUpdatedEventData {
  oldRoot: string;
  newRoot: string;
}

export class EthMerkleRootUpdated extends AbstractEvent<EthMerkleRootUpdatedEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.CumulativeMerkleDistributorEthMerkleRootUpdated;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.EthMerkleRootUpdated();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 1;
  }

  protected transformEvent(event: { log: Log; baseParams: BaseParams }): EthMerkleRootUpdatedEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const oldRoot = parsedLog.args.oldRoot.toLowerCase();
    const newRoot = parsedLog.args.newRoot.toLowerCase();

    return { oldRoot, newRoot };
  }
}
