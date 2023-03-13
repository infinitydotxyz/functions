import { ChainId } from '@infinityxyz/lib/types/core';

import { CollRef, DocRef, Firestore } from '../../../firestore/types';
import { SyncMetadata } from './types';

export const getSaleEventSyncsRef = (db: Firestore) => {
  return db
    .collection('_sync')
    .doc('_reservoirSales')
    .collection('_reservoirSalesSyncMetadata') as CollRef<SyncMetadata>;
};

export const getSaleEventSyncRef = (
  syncsRef: CollRef<SyncMetadata>,
  chainId: ChainId,
  type: SyncMetadata['metadata']['type'],
  collection?: string
) => {
  return syncsRef.doc(`${chainId}:${type}${collection ? `:${collection}` : ''}`) as DocRef<SyncMetadata>;
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
  const syncsRef = getSaleEventSyncsRef(db);

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
