import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';

export async function triggerScans(orders: FirestoreOrder[]) {
  try {
    const batchHandler = new BatchHandler();
    const ids = new Set();
    for (const order of orders) {
      if (!ids.has(order.id)) {
        ids.add(order.id);
        const doc = getDb().collection(firestoreConstants.ORDERS_COLL).doc(order.id);
        batchHandler.add(doc, { enqueued: true, enqueuedAt: Date.now() }, { merge: true });
      }
    }
    await batchHandler.flush();
  } catch (err) {
    console.error(err);
  }
}
