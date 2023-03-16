import { ethers } from 'ethers';
import Redis from 'ioredis';

import { Log } from '@ethersproject/abstract-provider';
import { ERC20ABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';

import { ProcessOptions } from '@/lib/process/types';

import { AbstractBlockProcessor } from '../block-processor.abstract';
import { AbstractEvent } from '../event.abstract';
import { BaseParams } from '../types';
import { Erc20ApprovalEvent } from './erc20-approval';
import { Erc20TransferEvent } from './erc20-transfer';

export class Erc20 extends AbstractBlockProcessor {
  protected events: AbstractEvent<unknown>[];

  constructor(
    _db: Redis,
    chainId: ChainId,
    _address: string,
    startBlockNumber: number,
    firestore: FirebaseFirestore.Firestore,
    provider: ethers.providers.StaticJsonRpcProvider,
    options?: ProcessOptions
  ) {
    super(_db, chainId, `erc20:${_address}`, startBlockNumber, _address, options);
    const contract = new ethers.Contract(_address, ERC20ABI, provider);

    const Events = [Erc20TransferEvent, Erc20ApprovalEvent];

    this.events = Events.map((Event) => new Event(chainId, contract, _address, firestore));
  }

  protected async _processBlock(
    eventLogs: { log: Log; baseParams: BaseParams }[],
    blockNumber: number,
    commitment: 'finalized' | 'latest',
    isBackfill: boolean,
    blockHash?: string | undefined
  ): Promise<void> {
    const promises = [];
    for (const event of this.events) {
      promises.push(event.handleBlock(eventLogs, blockNumber, commitment, isBackfill, blockHash));
    }
    await Promise.all(promises);
  }
}
