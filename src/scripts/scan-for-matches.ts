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

// void scanForMatches('0x91c31915fc2eb26e7eda09c0e2d142c61b67e8f737efa1b0ba915ac2a45f275d');
void scanForMatch('0xc60d8ebc34007712fd4ec0ca11f27019828a7d896bbd2efcb792246481995f36');
