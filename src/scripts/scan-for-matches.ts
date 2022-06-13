import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { streamQuery } from '../firestore/stream-query';
import { Order } from '../orders/order';

async function scanForMatches(id?: string) {
  const db = getDb();
  let query = db.collection(firestoreConstants.ORDERS_COLL) as unknown as FirebaseFirestore.Query<FirestoreOrder>;
  if (id) {
    query = query.where('id', '==', id);
  } else {
    query = query.where('orderStatus', '==', OBOrderStatus.ValidActive);
  }

  const orders = streamQuery(query, (order, ref) => [ref], { pageSize: 50 });
  let orderNum = 0;
  for await (const orderData of orders) {
    console.log(`Scanning order ${++orderNum}`);
    const order = new Order(orderData);
    const matches = await order.searchForMatches();
    if (matches.length > 0) {
      console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
      try {
        await order.saveMatches(matches);
      } catch (err) {
        console.error(err);
      }
    }
  }
}

void scanForMatches('0xad17d5d74bbe889d67495d857cdf58f05680d6b50cc260f3361ace5cdb9777ab');
