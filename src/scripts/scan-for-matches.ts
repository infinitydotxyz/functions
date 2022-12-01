import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import * as MatchingEngine from '@/lib/matching-engine';

import { streamQuery } from '../firestore/stream-query';

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
      const order = new MatchingEngine.Order(orderData);
      const { matches } = await order.searchForMatches();
      await order.saveMatches(matches);
      console.log(`Found: ${matches.length} matches for order: ${order.firestoreOrder.id}`);
    } catch (err) {
      console.error(err);
    }
  }
}

void scanForMatches('0x23a97324148963aa7114c6e883c229e436c14e17f658f77868aaf24d4097bbc2');
