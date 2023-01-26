import { ChainId } from '@infinityxyz/lib/types/core';

import { CollRef, DocRef, Firestore } from '../../../firestore/types';
import { SyncMetadata } from './types';

export const getOrderEventSyncsRef = (db: Firestore) => {
  return db
    .collection('_sync')
    .doc('_reservoirSales')
    .collection('_reservoirSalesSyncMetadata') as CollRef<SyncMetadata>;
};

export const getOrderEventSyncRef = (
  syncsRef: CollRef<SyncMetadata>,
  chainId: ChainId,
  type: SyncMetadata['metadata']['type']
) => {
  return syncsRef.doc(`${chainId}:${type}`) as DocRef<SyncMetadata>;
};

export async function getSyncMetadata(
  db: Firestore,
  options?: { txn?: FirebaseFirestore.Transaction }
): Promise<
  {
    data: SyncMetadata;
    ref: DocRef<SyncMetadata>;
  }[]
> {
  const syncsRef = getOrderEventSyncsRef(db);

  let snap;
  if (options?.txn) {
    snap = await options.txn.get(syncsRef);
  } else {
    snap = await syncsRef.get();
  }
  const syncs = snap.docs.map((item) => {
    const data = item.data();

    return {
      data,
      ref: item.ref
    };
  });

  return syncs;
}

export async function getChainSyncMetadata(
  db: Firestore,
  chainId: ChainId,
  type: SyncMetadata['metadata']['type'],
  options?: { txn?: FirebaseFirestore.Transaction }
) {
  const syncsRef = getOrderEventSyncsRef(db);
  const syncRef = getOrderEventSyncRef(syncsRef, chainId, type);

  let snap;
  if (options?.txn) {
    snap = await options.txn.get(syncRef);
  } else {
    snap = await syncRef.get();
  }

  const data = snap.data() as SyncMetadata;

  return {
    data,
    ref: snap.ref
  };
}
