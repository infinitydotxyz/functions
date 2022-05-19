import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { Order } from '../orders/order';

async function searchForMatch(orderId: string) {
  const db = getDb();
  const orderSnapshot = await db.collection(firestoreConstants.ORDERS_COLL).doc(orderId).get();

  const orderData = orderSnapshot.data() as FirestoreOrder | undefined;
  if (!orderData) {
    throw new Error(`Failed to find order with id ${orderId}`);
  }

  const order = new Order(orderData);

  const matches = await order.searchForMatches();
  matches.sort((a, b) => a.timestamp - b.timestamp);
  console.log(JSON.stringify(matches, null, 2));
//   await order.saveMatches(matches);
}


void searchForMatch('0xb10cd1b9cc489c4d44ed688a1f60cc32aa9d86162b67c4aa2230c60ba5de49dd');