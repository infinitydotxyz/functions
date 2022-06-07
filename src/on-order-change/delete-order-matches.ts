import { FirestoreOrderMatch } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';

export async function deleteOrderMatches(orderId: string) {
  const db = getDb();
  const batchHandler = new FirestoreBatchHandler();
  const matchesQuery = db.collection(firestoreConstants.ORDER_MATCHES_COLL).where('ids', 'array-contains', orderId);
  const matches = matchesQuery.stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;
  for await (const match of matches) {
    batchHandler.delete(match.ref);
  }
  await batchHandler.flush();
}
