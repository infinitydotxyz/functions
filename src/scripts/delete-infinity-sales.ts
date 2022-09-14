import { SaleSource } from '@infinityxyz/lib/types/core';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';

async function deleteInfinitySales() {
  const db = getDb();

  const sales = db.collection('sales');
  const infinitySales = sales.where('source', '==', SaleSource.Infinity);
  const stream = streamQueryWithRef(infinitySales, (_, ref) => [ref], { pageSize: 300 });

  const batch = new FirestoreBatchHandler();
  for await (const { ref } of stream) {
    await batch.deleteAsync(ref as FirebaseFirestore.DocumentReference<any>);
  }

  await batch.flush();
}

void deleteInfinitySales();
