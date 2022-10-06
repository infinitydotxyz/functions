import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';

export async function reaggregateCuration() {
  const db = getDb();

  const query = db.collectionGroup('curationLedger');

  const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });

  const batch = new FirestoreBatchHandler();
  for await (const { ref } of stream) {
    await batch.addAsync(ref, { isAggregated: false, updatedAt: Date.now() }, { merge: true });
  }
  await batch.flush();
}

void reaggregateCuration();
