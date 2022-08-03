import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';

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
  
  const query = intervalSales.where('isAggregated', '==', false).where('isDeleted', '==', false).where('updatedAt', '<', retriggerIfUpdatedBefore);
  const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });
  
  const updatePaths = new Set<string>();
  const trigger = (ref?: FirebaseFirestore.DocumentReference | null) => {
    if (ref && !updatePaths.has(ref.path)) {
      updatePaths.add(ref.path);
      batchHandler.add(ref, { updatedAt: Date.now(), hasUnaggregatedSales: true }, { merge: true });
      console.log(`Re-triggering aggregation for ${ref.path}`);
    }
  }

  for await (const item of stream) {
    const aggregatedSalesDoc = item.ref.parent.parent;
    trigger(aggregatedSalesDoc)
  }

  for (const collection of collectionGroups) {
    const query = collection.where('isAggregated', '==', false).where('updatedAt', '<', retriggerIfUpdatedBefore);
    const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });
    for await (const item of stream) {
      trigger(item.ref);
    }
  }


  await batchHandler.flush();
}
