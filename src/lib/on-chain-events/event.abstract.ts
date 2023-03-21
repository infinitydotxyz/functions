import { EventFilter, ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import { FieldPath } from 'firebase-admin/firestore';

import { CallTrace } from '@georgeroman/evm-tx-simulator/dist/types';
import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_HOUR, toNumericallySortedLexicographicStr } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { redis } from '../../app-engine/redis';
import { BaseParams, ContractEvent, ContractEventKind } from './types';

export abstract class AbstractEvent<T> {
  protected _address: string;
  protected abstract _topics: (string | string[])[];
  protected abstract _topic: string | string[];
  protected abstract _numTopics: number;

  protected abstract _eventKind: ContractEventKind;

  public get eventFilter(): EventFilter {
    return {
      address: this._address,
      topics: this._topics
    };
  }

  constructor(
    protected _chainId: ChainId,
    _address: string,
    protected _iface: Interface,
    protected _db: FirebaseFirestore.Firestore
  ) {
    this._address = _address;
  }

  matches(event: ethers.providers.Log, baseParams: BaseParams): boolean {
    if (this._address !== baseParams.address) {
      return false;
    }
    const topicsMatch = event.topics[0] === this._topic && event.topics.length === this._numTopics;
    return topicsMatch;
  }

  protected getEventId(baseParams: BaseParams) {
    const blockIndex = toNumericallySortedLexicographicStr(baseParams.block, 64);
    const logIndex = toNumericallySortedLexicographicStr(baseParams.logIndex, 64);
    const batchIndex = toNumericallySortedLexicographicStr(baseParams.batchIndex, 64);
    return `${blockIndex}${logIndex}${batchIndex}`;
  }

  protected async handleReorgs(batch: BatchHandler, blockNumber: number, blockHash?: string) {
    const address = this._address;
    const collectionRef = this._db.collection(`contractStates`).doc(`${this._chainId}:${address}`);
    const contractEvents = collectionRef.collection(`contractEvents`);
    let query = contractEvents
      .where('metadata.eventKind', '==', this._eventKind)
      .where('baseParams.chainId', '==', this._chainId)
      .where('baseParams.address', '==', address)
      .where('baseParams.block', '==', blockNumber);

    query = query.orderBy(FieldPath.documentId());

    const stream = streamQueryWithRef(query);

    for await (const { ref, data } of stream) {
      let reorged = false;

      if (!blockHash) {
        reorged = true;
      } else {
        reorged = data.baseParams.blockHash !== blockHash;
      }

      const update: ContractEvent<unknown>['metadata'] = {
        eventId: data.metadata.eventId,
        eventKind: data.metadata.eventKind,
        commitment: 'finalized',
        processed: false,
        reorged
      };
      await batch.addAsync(ref, { metadata: update }, { merge: true });
    }
    await batch.flush();
  }

  async handleBlock(
    events: { log: ethers.providers.Log; baseParams: BaseParams }[],
    blockNumber: number,
    commitment: 'finalized' | 'latest',
    isBackfill: boolean,
    blockHash?: string
  ): Promise<void> {
    const batchHandler = new BatchHandler();
    for (const { log, baseParams } of events) {
      if (this.matches(log, baseParams)) {
        const collectionRef = this._db.collection(`contractStates`).doc(`${this._chainId}:${baseParams.address}`);
        const contractEvents = collectionRef.collection(`contractEvents`) as CollRef<ContractEvent<unknown>>;
        const eventData = await this.transformEvent({ log, baseParams });
        const eventId = this.getEventId(baseParams);
        const event: ContractEvent<T> = {
          event: eventData,
          metadata: {
            eventId,
            eventKind: this._eventKind,
            commitment,
            processed: false,
            reorged: false
          },
          baseParams
        };
        const ref = contractEvents.doc(eventId);
        await batchHandler.addAsync(ref, event, { merge: false });
      }
    }

    await batchHandler.flush();

    if (commitment === 'finalized' && !isBackfill) {
      await this.handleReorgs(batchHandler, blockNumber, blockHash);
    }
  }

  abstract transformEvent(event: { log: ethers.providers.Log; baseParams: BaseParams }): T | Promise<T>;

  protected async getCallTrace(params: { txHash: string }) {
    const txTraceCacheKey = `chain:${this._chainId}:txTrace:${params.txHash}:cache`;
    let trace: CallTrace;
    try {
      const traceString = await redis.get(txTraceCacheKey);
      trace = JSON.parse(traceString ?? '') as CallTrace;
    } catch (err) {
      const provider = getProvider(this._chainId);
      trace = await this.getTxTrace({ hash: params.txHash }, provider);

      await redis.set(txTraceCacheKey, JSON.stringify(trace), 'PX', ONE_HOUR);
    }

    return trace;
  }

  protected async getTxTrace(tx: { hash: string }, provider: ethers.providers.JsonRpcProvider) {
    const trace: CallTrace = await provider.send('debug_traceTransaction', [tx.hash, { tracer: 'callTracer' }]);

    if (trace.error) {
      throw new Error('execution-reverted');
    }

    return trace;
  }
}
