import { BigNumber, Contract } from 'ethers';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractEvent } from '../event.abstract';
import { BaseParams, ContractEventKind } from '../types';

export interface EthClaimedEventData {
  user: string;
  amount: string;
}

export class EthClaimed extends AbstractEvent<EthClaimedEventData> {
  protected _topics: (string | string[])[];
  protected _topic: string | string[];
  protected _numTopics: number;
  protected _eventKind = ContractEventKind.CumulativeMerkleDistributorEthClaimed;

  constructor(chainId: ChainId, contract: Contract, address: string, db: FirebaseFirestore.Firestore) {
    super(chainId, address, contract.interface, db);
    const event = contract.filters.EthClaimed();
    this._topics = event.topics ?? [];
    this._topic = this._topics[0];
    this._numTopics = 1;
  }

  transformEvent(event: { log: Log; baseParams: BaseParams }): EthClaimedEventData {
    const parsedLog = this._iface.parseLog(event.log);
    const user = parsedLog.args.user.toLowerCase();
    const amount = BigNumber.from(parsedLog.args.amount).toString();
    return { user, amount };
  }
}
