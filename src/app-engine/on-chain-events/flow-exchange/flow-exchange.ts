/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ethers } from 'ethers';
import Redis from 'ioredis';

import { Log } from '@ethersproject/abstract-provider';
import { FlowExchangeABI } from '@infinityxyz/lib/abi/flowExchange';
import { ChainId } from '@infinityxyz/lib/types/core';

import { ProcessOptions } from '@/lib/process/types';

import { AbstractBlockProcessor } from '../block-processor.abstract';
import { AbstractEvent } from '../event.abstract';
import { OwnershipTransferredEvent } from '../ownable/ownership-transferred';
import { PausedEvent } from '../pauseable/paused-event';
import { UnpausedEvent } from '../pauseable/unpaused-event';
import { BaseParams } from '../types';
import { CancelAllOrdersEvent } from './cancel-all-orders';
import { CancelMultipleOrdersEvent } from './cancel-multiple-orders';
import { ERC20WithdrawnEvent } from './erc20-withdrawn';
import { ETHWithdrawnEvent } from './eth-withdrawn';
import { MatchExecutorUpdatedEvent } from './match-executor-updated';
import { MatchOrderFulfilledEvent } from './match-order-fulfilled';
import { ProtocolFeeUpdatedEvent } from './protocol-fee-updated';
import { TakeOrderFulfilledEvent } from './take-order-fulfilled';
import { WethTransferGasUnitsUpdated } from './weth-transfer-gas-units-updated';

export class FlowExchange extends AbstractBlockProcessor {
  protected events: AbstractEvent<unknown>[];

  constructor(
    _db: Redis,
    chainId: ChainId,
    _address: string,
    startBlockNumber: number,
    firestore: FirebaseFirestore.Firestore,
    options?: ProcessOptions
  ) {
    super(_db, chainId, `flow-exchange:${_address}`, startBlockNumber, _address, options);
    const contract = new ethers.Contract(_address, FlowExchangeABI);

    const Events = [
      CancelAllOrdersEvent,
      CancelMultipleOrdersEvent,
      ERC20WithdrawnEvent,
      ETHWithdrawnEvent,
      MatchExecutorUpdatedEvent,
      MatchOrderFulfilledEvent,
      ProtocolFeeUpdatedEvent,
      TakeOrderFulfilledEvent,
      WethTransferGasUnitsUpdated,
      OwnershipTransferredEvent,
      PausedEvent,
      UnpausedEvent
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
