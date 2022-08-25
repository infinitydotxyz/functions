import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { SalesIntervalDoc } from './types';

export async function retriggerAggregation() {
  const db = getDb();
  const intervalSales = db.collectionGroup('intervalSales');
  const collectionAggregatedSales = db.collectionGroup('aggregatedCollectionSales');
  const nftAggregatedSales = db.collectionGroup('aggregatedNftSales');
  const sourceAggregatedSales = db.collectionGroup('aggregatedSourceSales');
  const collectionGroups = [collectionAggregatedSales, nftAggregatedSales, sourceAggregatedSales];
  const tenMin = 60 * 1000 * 10;
  const retriggerIfUpdatedBefore = Date.now() - tenMin;
  const batchHandler = new FirestoreBatchHandler();

  const updatePaths = new Set<string>();
  const trigger = <T extends { updatedAt: number; hasUnaggregatedSales: boolean }>(
    ref?: FirebaseFirestore.DocumentReference<T> | null
  ) => {
    if (ref && !updatePaths.has(ref.path)) {
      updatePaths.add(ref.path);
      const update: Partial<T> = { updatedAt: Date.now(), hasUnaggregatedSales: true } as Partial<T>;
      batchHandler.add(ref, update, { merge: true });
      console.log(`Re-triggering aggregation for ${ref.path}`);
    }
  };

  const query = intervalSales
    .where('isAggregated', '==', false)
    .where('isDeleted', '==', false)
    .where('updatedAt', '<', retriggerIfUpdatedBefore);
  const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });
  for await (const item of stream) {
    const aggregatedSalesDoc = item.ref.parent.parent as FirebaseFirestore.DocumentReference<SalesIntervalDoc>;
    trigger(aggregatedSalesDoc);
  }

  for (const collection of collectionGroups) {
    const query = collection
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', retriggerIfUpdatedBefore) as FirebaseFirestore.Query<SalesIntervalDoc>;
    const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });
    for await (const item of stream) {
      trigger(item.ref);
    }
  }

  await batchHandler.flush();
}