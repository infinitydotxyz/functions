import { ChainId } from '@infinityxyz/lib/types/core';

import { Firestore } from '../../../firestore/types';
import { getOrderEventSyncRef, getOrderEventSyncsRef } from './get-sync-metadata';
import { SyncMetadata, SyncMetadataType } from './types';

const DEFAULT_TYPES: SyncMetadataType[] = ['ask', 'bid'];

type SyncUpdater = (db: Firestore, chainId: ChainId, types: SyncMetadataType[]) => Promise<void>;

export const addSyncs: SyncUpdater = (db, chainId, types = DEFAULT_TYPES) => {
  const syncsRef = getOrderEventSyncsRef(db);
  const syncs = types.map((item) => {
    return {
      chainId,
      type: item,
      ref: getOrderEventSyncRef(syncsRef, chainId, item)
    };
  });

  return db.runTransaction(async (txn) => {
    const snaps = await txn.getAll(...syncs.map((item) => item.ref));
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
            isPaused: false
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

const updateIsPaused = (db: Firestore, chainId: ChainId, types = DEFAULT_TYPES, isPaused: boolean) => {
  const syncsRef = getOrderEventSyncsRef(db);
  const syncs = types.map((item) => {
    return {
      chainId,
      type: item,
      ref: getOrderEventSyncRef(syncsRef, chainId, item)
    };
  });
  return db.runTransaction(async (txn) => {
    const snaps = await txn.getAll(...syncs.map((item) => item.ref));
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
            isPaused
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

export const pauseSyncs: SyncUpdater = (db, chainId, types = DEFAULT_TYPES) => {
  return updateIsPaused(db, chainId, types, true);
};

export const unpauseSyncs: SyncUpdater = (db, chainId, types = DEFAULT_TYPES) => {
  return updateIsPaused(db, chainId, types, false);
};
