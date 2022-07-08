import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { streamQuery } from '../firestore/stream-query';
import { Order } from '../orders/order';

async function scanForMatches(id: string) {
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
    try {
      console.log(`Scanning order ${++orderNum}`);
      const order = new Order(orderData);
      const { matches } = await order.searchForMatches();
      await order.saveMatches(matches);
      console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
    } catch (err) {
      console.error(err);
    }
  }
}

void scanForMatches('0xa30128d848a7ce135ffc48f377a49fa177001db159e99474be7c481db4c48a98');
