import Redis from 'ioredis';

import { ChainId, EventType } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { AbstractSandboxProcess } from '@/lib/process/sandbox-process.abstract';
import { ProcessOptions } from '@/lib/process/types';

export interface SearchCollections {
  id: string;
  type: 'search-collections';
}

export interface PurgeCollection {
  id: string;
  type: 'purge-collection';
  chainId: ChainId;
  address: string;
}

export interface PurgeOrderSnapshots {
  id: string;
  type: 'purge-order-snapshots';
}

export interface TriggerPurgeContractEvents {
  id: string;
  type: 'trigger-purge-contract-events';
}

export interface PurgeContractEvents {
  id: string;
  type: 'purge-contract-events';
  chainId: ChainId;
  address: string;
}

export interface PurgeFeedEvents {
  id: string;
  type: 'purge-feed-events';
  eventType: EventType;
}

export interface TriggerPurgeOrders {
  id: string;
  type: 'trigger-purge-orders';
}

export interface PurgeOrder {
  id: string;
  type: 'purge-order';
  orderId: string;
}

export type JobData =
  | SearchCollections
  | PurgeCollection
  | PurgeOrderSnapshots
  | TriggerPurgeContractEvents
  | PurgeContractEvents
  | PurgeFeedEvents
  | TriggerPurgeOrders
  | PurgeOrder;
export type JobResult = void;

export class FirestoreDeletionProcess extends AbstractSandboxProcess<JobData, JobResult> {
  constructor(db: Redis, options?: ProcessOptions) {
    super(db, `firestore-deletion-process:${config.isDev ? 'dev' : 'prod'}`, `${__dirname}/worker.js`, options);
  }
}
