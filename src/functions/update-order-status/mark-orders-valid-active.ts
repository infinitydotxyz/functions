import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { getDb } from '@/firestore/db';

import { updateOrderStatus } from './update-order-status';

export async function markOrdersValidActive(): Promise<void> {
  const db = getDb();

  const orders = db.collection(firestoreConstants.ORDERS_COLL);

  const validInactiveOrders = orders.where('orderStatus', '==', OBOrderStatus.ValidInactive);

  const unExpiredValidInactiveOrders = validInactiveOrders.where('startTimeMs', '>=', Date.now());

  const stream = unExpiredValidInactiveOrders.stream() as AsyncIterable<
    FirebaseFirestore.DocumentSnapshot<FirestoreOrder>
  >;

  for await (const orderSnap of stream) {
    try {
      const isSellOrder = orderSnap.data()?.isSellOrder;
      await updateOrderStatus(orderSnap.ref, OBOrderStatus.ValidActive, isSellOrder);
    } catch (err) {
      console.error('Failed to update order status', err);
    }
  }
}
