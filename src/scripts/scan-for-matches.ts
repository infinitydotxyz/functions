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
    try {
      console.log(`Scanning order ${++orderNum}`);
      const order = new Order(orderData);
      const node = new Node(order, order.firestoreOrder.numItems);
      const graph = new OrdersGraph(node);
      const { matches } = await graph.search();
      await graph.root.data.saveMatches(matches);
      console.log(matches);
      console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
    } catch (err) {
      console.error(err);
    }
  }
}

// void scanForMatches('0xc8ec05bd3b233e96942c496247ee12832abb7828de2e4e99cb80a77136f8f10f');
void scanForMatch('0x462c0f5ddfa2df9a138c985006ad9d170d764176e60b377a30b5a27e01df5ac5');
