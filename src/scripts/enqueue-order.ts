import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';

export async function enqueueOrder(id: string) {
  const db = getDb();
  await db.collection(firestoreConstants.ORDERS_COLL).doc(id).set({ enqueued: true }, { merge: true });
}

void enqueueOrder('0x13140e50250ffe8cebaa2182965aad3980c1f509860b478f18fe2a6d039b3ea3');
