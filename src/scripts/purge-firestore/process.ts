import { Redis } from 'ioredis';

import { ChainId, EventType } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { AbstractSandboxProcess } from '@/lib/process/sandbox-process.abstract';
import { ProcessOptions } from '@/lib/process/types';

/**
 * This process deletes the specified feed events
 */
export interface FeedJobData {
  id: string;
  type: 'feed';
  eventTypeToDelete: EventType;
  keepEventsAfterTimestamp: number;
}

/**
 * This process deletes the marketplace stats collection
 */
export interface MarketplaceStatsJobData {
  id: string;
  type: 'marketplace-stats';
}

/**
 * This process splits collections into chunks to be
 * processed in parallel
 */
export interface CollectionsTriggerJobData {
  id: string;
  type: 'collections-trigger';
  numQueries: number;
  chainId: ChainId;
}

/**
 * This process takes a range of collection addresses and
 * purges data for collections in that range
 */
export interface CollectionsJobData {
  id: string;
  chainId: ChainId;
  type: 'collections';
  numQueries: number;
  min: string;
  max: string;
}

export interface NftsTriggerJobData {
  id: string;
  chainId: ChainId;
  type: 'nfts-trigger';
  numQueries: number;
}

export interface NftsJobData {
  id: string;
  chainId: ChainId;
  type: 'nfts';
  numQueries: number;
  min: string;
  max: string;
}

export interface CollectionStatsTriggerJobData {
  id: string;
  chainId: ChainId;
  type: 'collection-stats-trigger';
  numQueries: number;
}

export interface CollectionStatsJobData {
  id: string;
  chainId: ChainId;
  type: 'collection-stats';
  numQueries: number;
  min: string;
  max: string;
}

export interface SocialsStatsTriggerJobData {
  id: string;
  chainId: ChainId;
  type: 'socials-stats-trigger';
  numQueries: number;
}

export interface SocialsStatsJobData {
  id: string;
  chainId: ChainId;
  type: 'socials-stats';
  numQueries: number;
  min: string;
  max: string;
}

export interface NftStatsTriggerJobData {
  id: string;
  chainId: ChainId;
  type: 'nft-stats-trigger';
  numQueries: number;
}

export interface NftStatsJobData {
  id: string;
  chainId: ChainId;
  type: 'nft-stats';
  numQueries: number;
  min: string;
  max: string;
}

export type JobData =
  | FeedJobData
  | MarketplaceStatsJobData
  | CollectionsTriggerJobData
  | CollectionsJobData
  | NftsTriggerJobData
  | NftsJobData
  | CollectionStatsTriggerJobData
  | CollectionStatsJobData
  | SocialsStatsTriggerJobData
  | SocialsStatsJobData
  | NftStatsTriggerJobData
  | NftStatsJobData;
export type JobResult = void;

export class FirestoreDeletionProcess extends AbstractSandboxProcess<JobData, JobResult> {
  constructor(db: Redis, options?: ProcessOptions) {
    super(db, `firestore-deletion-process:${config.isDev ? 'dev' : 'prod'}`, `${__dirname}/worker.js`, options);
  }
}
