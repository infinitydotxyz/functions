import Redis from 'ioredis';

import { ChainId } from '@infinityxyz/lib/types/core';

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

// TODO Feed

export type JobData = SearchCollections | PurgeCollection;
export type JobResult = void;

export class FirestoreDeletionProcess extends AbstractSandboxProcess<JobData, JobResult> {
  constructor(db: Redis, options?: ProcessOptions) {
    super(db, `firestore-deletion-process:${config.isDev ? 'dev' : 'prod'}`, `${__dirname}/worker.js`, options);
  }
}
