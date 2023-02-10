import { ChainId } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { DocRef, Firestore } from '@/firestore/types';
import { logger } from '@/lib/logger';

import { Reservoir } from '../..';
import { SyncMetadata } from './types';

export const checkProgress = async (db: Firestore, chainId: ChainId, collection?: string) => {
  const syncs = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);
  let syncRef: DocRef<SyncMetadata>;
  if (collection) {
    syncRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncRef(syncs, chainId, 'collection-ask', collection);
  } else {
    syncRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncRef(syncs, chainId, 'ask');
  }

  const syncSnap = await syncRef.get();
  const syncData = syncSnap.data();
  const continuation = syncData?.data.continuation;

  if (!continuation) {
    throw new Error('no continuation');
  }
  const method = Reservoir.Api.Events.AskEvents.getEvents;
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const contract = collection ? { contract: collection } : {};
  const pageSize = 500;
  const nextPage = await method(client, {
    ...contract,
    continuation,
    limit: pageSize,
    sortDirection: 'asc'
  });

  const nextId = nextPage.data.events[nextPage.data.events.length - 1].event.id;
  const nextTimestamp = nextPage.data.events[nextPage.data.events.length - 1].event.createdAt;

  const mostRecentPage = await method(client, {
    ...contract,
    limit: 1,
    sortDirection: 'desc'
  });

  const currentId = mostRecentPage.data.events[0].event.id;
  const currentTimestamp = mostRecentPage.data.events[0].event.createdAt;

  if (!nextTimestamp || !currentTimestamp) {
    logger.log('check-syncs', `Failed to find timestamps - sync progress will be checked again in 1 minute`);
    return false;
  }

  const currentTimestampMs = new Date(currentTimestamp).getTime();
  const nextTimestampMs = new Date(nextTimestamp).getTime();
  const difference = Math.ceil(Math.abs(currentTimestampMs - nextTimestampMs) / 1000);
  const oneHour = 60 * 60;
  if (nextPage.data.events.length < pageSize || difference < oneHour) {
    logger.log('check-syncs', `Sync ${syncRef.id} complete`);
    return true;
  }

  const days = Math.floor(difference / (60 * 60 * 24));
  const hours = Math.floor((difference / (60 * 60)) % 24);
  const minutes = Math.floor((difference / 60) % 60);
  const seconds = Math.floor(difference % 60);

  logger.log(
    'check-syncs',
    `Sync ${syncRef.id} At ID: ${nextId} Reservoir at ID: ${currentId} Difference ${difference} seconds - ${days}d ${hours}h ${minutes}m ${seconds}s`
  );

  return false;
};
