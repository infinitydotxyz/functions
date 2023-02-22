import { ethers } from 'ethers';
import Redis from 'ioredis';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';

import { ProcessOptions } from '@/lib/process/types';

import { AbstractBlockProcessor } from '../block-processor.abstract';
import { AbstractEvent } from '../event.abstract';
import { OwnershipTransferredEvent } from '../ownable/ownership-transferred';
import { BaseParams } from '../types';
import { CumulativeMerkleDistributorABI } from './abi';
import { Erc20Added } from './erc20-added';
import { Erc20Claimed } from './erc20-claimed';
import { Erc20MerkleRootUpdated } from './erc20-merkle-root-updated';
import { Erc20Removed } from './erc20-removed';
import { Erc20Withdrawn } from './erc20-withdrawn';
import { EthClaimed } from './eth-claimed';
import { EthMerkleRootUpdated } from './eth-merkle-root-updated';
import { EthWithdrawn } from './eth-withdrawn';

export class CumulativeMerkleDistributor extends AbstractBlockProcessor {
  protected events: AbstractEvent<unknown>[];

  constructor(
    _db: Redis,
    chainId: ChainId,
    _address: string,
    startBlockNumber: number,
    firestore: FirebaseFirestore.Firestore,
    options?: ProcessOptions
  ) {
    super(_db, chainId, `cumulative-merkle-distributor:${_address}`, startBlockNumber, _address, options);
    const contract = new ethers.Contract(_address, CumulativeMerkleDistributorABI);

    const Events = [
      OwnershipTransferredEvent,
      Erc20MerkleRootUpdated,
      EthMerkleRootUpdated,
      Erc20Claimed,
      EthClaimed,
      EthWithdrawn,
      Erc20Withdrawn,
      Erc20Added,
      Erc20Removed
    ];

    this.events = Events.map((Event) => new Event(chainId, contract, _address, firestore));
  }

  protected async _processBlock(
    events: { log: Log; baseParams: BaseParams }[],
    blockNumber: number,
    commitment: 'finalized' | 'latest',
    isBackfill: boolean,
    blockHash?: string | undefined
  ): Promise<void> {
    const promises = [];
    for (const event of this.events) {
      promises.push(event.handleBlock(events, blockNumber, commitment, isBackfill, blockHash));
    }
    await Promise.all(promises);
  }
}
