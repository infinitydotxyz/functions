import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { streamQuery } from '../firestore/stream-query';
import { Order } from '../orders/order';

async function scanForMatches() {
  const db = getDb();
  const query = db
    .collection(firestoreConstants.ORDERS_COLL)
    .where('orderStatus', '==', OBOrderStatus.ValidActive).orderBy('__name__') as FirebaseFirestore.Query<FirestoreOrder>;
  const orders = streamQuery(query, (order, ref) => [ref.id], { pageSize: 50 });

  let orderNum = 0;
  for await (const orderData of orders) {
    console.log(`Scanning order ${++orderNum}`);
    const order = new Order(orderData);
    const matches = await order.searchForMatches();
    if (matches.length > 0) {
      console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
      await order.saveMatches(matches);
    }
  }
}

void scanForMatches();
