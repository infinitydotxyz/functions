import { ChainId } from '@infinityxyz/lib/types/core';

import { Firestore } from '../../../firestore/types';
import { getOrderEventSyncRef, getOrderEventSyncsRef } from './get-sync-metadata';
import { SyncMetadata, SyncMetadataType } from './types';

type SyncUpdater = (db: Firestore, chainId: ChainId, types: SyncMetadataType[]) => Promise<void>;

export const addSyncs: SyncUpdater = async (db, chainId, types: SyncMetadataType[]) => {
  const syncsRef = getOrderEventSyncsRef(db);
  const syncs = (types ?? []).map((item) => {
    return {
      chainId,
      type: item,
      ref: getOrderEventSyncRef(syncsRef, chainId, item)
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
            isPaused: false
          },
          data: {
            eventsProcessed: 0,
            mostRecentItem: null
          }
        };
        txn.set(sync.ref, data);
      }
    }
  });
};
