import { OBOrderStatus, FirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import { updateOrderStatus } from './update-order-status';

export async function markOrdersValidActive(): Promise<void> {
  const db = getDb();

  const orders = db.collection(firestoreConstants.ORDERS_COLL);

  const validActiveOrders = orders.where('orderStatus', '==', OBOrderStatus.ValidInactive);

  const expiredValidActiveOrders = validActiveOrders.where('startTimeMs', '>=', Date.now());

  const stream = expiredValidActiveOrders.stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrder>>;

  for await (const orderSnap of stream) {
    try {
      await updateOrderStatus(orderSnap.ref, OBOrderStatus.ValidActive);
    } catch (err) {
      console.error('Failed to update order status', err);
    }
  }
}
