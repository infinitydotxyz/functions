import { FirestoreOrderMatch } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';

export async function clearMatches() {
  const db = getDb();

  const stream = db.collection(firestoreConstants.ORDER_MATCHES_COLL).stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>
  >;

  const batchHandler = new BatchHandler();
  for await (const item of stream) {
    batchHandler.delete(item.ref);
  }

  await batchHandler.flush();
}

void clearMatches();
