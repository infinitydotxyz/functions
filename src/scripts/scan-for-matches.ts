import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { streamQuery } from '../firestore/stream-query';
import { OrdersGraph } from '../graph/orders-graph';
import { Order } from '../orders/order';
import { Node } from '../graph/node';

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
    const { matches } = await order.searchForMatches();
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

async function scanForMatch(id: string) {
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
    const node = new Node(order, order.firestoreOrder.numItems);
    const graph = new OrdersGraph(node);
    const matches = await graph.search();
    await graph.root.data.saveMatches(matches);
    console.log(matches);
    console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
  }
}

// void scanForMatches('0xad17d5d74bbe889d67495d857cdf58f05680d6b50cc260f3361ace5cdb9777ab');
void scanForMatch('0x8a1ff83ddf8cef01925d8887bdc4aa7e222a9e29de1c8778e9473248cc8dde69');
