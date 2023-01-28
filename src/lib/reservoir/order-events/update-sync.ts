import { ChainId } from '@infinityxyz/lib/types/core';

import { Firestore } from '../../../firestore/types';
import { getOrderEventSyncRef, getOrderEventSyncsRef } from './get-sync-metadata';
import { SyncMetadata, SyncMetadataType } from './types';

const CHAIN_TYPES: SyncMetadataType[] = ['ask', 'bid'];
const COLLECTION_TYPES: SyncMetadataType[] = ['collection-ask', 'collection-bid'];

type SyncUpdater = (
  db: Firestore,
  chainId: ChainId,
  types: SyncMetadataType[],
  collection?: string,
  startAt?: number
) => Promise<void>;

export const addSyncs: SyncUpdater = (
  db,
  chainId,
  types?: SyncMetadataType[],
  collection?: string,
  startAt?: number
) => {
  if (!types && collection) {
    types = COLLECTION_TYPES;
  } else if (!types) {
    types = CHAIN_TYPES;
  }

  const syncsRef = getOrderEventSyncsRef(db);
  const syncs = types.map((item) => {
    return {
      chainId,
      type: item,
      ref: getOrderEventSyncRef(syncsRef, chainId, item, collection)
    };
  });

  return db.runTransaction(async (txn) => {
    const snaps = syncs.length > 0 ? await txn.getAll(...syncs.map((item) => item.ref)) : [];
    for (let i = 0; i < syncs.length; i++) {
      const sync = syncs[i];
      const snap = snaps[i];

      if (snap.exists) {
        throw new Error(`Sync already exists for chainId: ${chainId} and type: ${sync.type}`);
      } else {
        const data: SyncMetadata = {
          metadata: {
            chainId: sync.chainId,
            type: sync.type,
            updatedAt: Date.now(),
            isPaused: false,
            collection
          },
          data: {
            eventsProcessed: 0,
            minTimestampMs: startAt ?? 0,
            continuation: ''
          }
        };
        txn.set(sync.ref, data);
      }
    }
  });
};

const updateIsPaused = (
  db: Firestore,
  chainId: ChainId,
  isPaused: boolean,
  types?: SyncMetadataType[],
  collection?: string
) => {
  if (!types && collection) {
    types = COLLECTION_TYPES;
  } else if (!types) {
    types = CHAIN_TYPES;
  }

  const syncsRef = getOrderEventSyncsRef(db);
  const syncs = types.map((item) => {
    return {
      chainId,
      type: item,
      ref: getOrderEventSyncRef(syncsRef, chainId, item, collection)
    };
  });
  return db.runTransaction(async (txn) => {
    const snaps = syncs.length > 0 ? await txn.getAll(...syncs.map((item) => item.ref)) : [];
    for (let i = 0; i < syncs.length; i++) {
      const sync = syncs[i];
      const snap = snaps[i];

      if (!snap.exists) {
        throw new Error(`Sync doesn't exists for chainId: ${chainId} and type: ${sync.type}`);
      } else {
        const data: SyncMetadata = {
          metadata: {
            chainId: sync.chainId,
            type: sync.type,
            updatedAt: Date.now(),
            isPaused,
            collection
          },
          data: {
            eventsProcessed: 0,
            continuation: ''
          }
        };
        txn.set(sync.ref, data);
      }
    }
  });
};

export const pauseSyncs: SyncUpdater = (db, chainId, types?: SyncMetadataType[], collection?: string) => {
  return updateIsPaused(db, chainId, true, types, collection);
};

export const unpauseSyncs: SyncUpdater = (db, chainId, types?: SyncMetadataType[], collection?: string) => {
  return updateIsPaused(db, chainId, false, types, collection);
};
