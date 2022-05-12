import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { FirestoreOrderMatch } from '../orders/orders.types';

export async function deleteOrderMatches(orderId: string) {
  const db = getDb();
  const batchHandler = new FirestoreBatchHandler();

  const matches = db
    .collection(firestoreConstants.ORDERS_COLL)
    .doc(orderId)
    .collection('orderMatches')
    .stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;
  for await (const match of matches) {
    batchHandler.delete(match.ref);
  }
  await batchHandler.flush();

  const triggers = db.collectionGroup('orderMatches').where('id', '==', orderId).stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>
  >;
  for await (const trigger of triggers) {
    batchHandler.delete(trigger.ref);
  }
  await batchHandler.flush();
}
