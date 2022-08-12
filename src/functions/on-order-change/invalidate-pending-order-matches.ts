import {
  FirestoreOrderMatch,
  FirestoreOrderMatchErrorCode,
  FirestoreOrderMatchStatus,
  OBOrderStatus,
  OrderMatchStateError
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';

export async function invalidatePendingOrderMatches(
  orderId: string,
  orderStatus: OBOrderStatus.ValidInactive | OBOrderStatus.Invalid
) {
  const db = getDb();
  const batchHandler = new FirestoreBatchHandler();
  const matchesQuery = db.collection(firestoreConstants.ORDER_MATCHES_COLL).where('ids', 'array-contains', orderId);
  const activeMatchesQuery = matchesQuery.where('state.status', '==', FirestoreOrderMatchStatus.Active);
  const inactiveMatchesQuery = matchesQuery.where('state.status', '==', FirestoreOrderMatchStatus.Inactive);

  const state: Partial<OrderMatchStateError> = {
    status: FirestoreOrderMatchStatus.Error,
    code: FirestoreOrderMatchErrorCode.OrderInvalid,
    error: `Order ${orderId} become inactive or invalid. Status ${orderStatus}.`
  };

  const activeMatches = activeMatchesQuery.stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>
  >;
  for await (const match of activeMatches) {
    batchHandler.add(match.ref, { state }, { merge: true });
  }

  const inactiveMatches = inactiveMatchesQuery.stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>
  >;
  for await (const match of inactiveMatches) {
    batchHandler.add(match.ref, { state }, { merge: true });
  }

  await batchHandler.flush();
}
