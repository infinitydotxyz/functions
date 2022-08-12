import { NftSale } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { Sales } from './models/sales';
import { SalesIntervalDoc, AggregationInterval } from './types';
import { parseAggregationId } from './utils';

export async function aggregateIntervalSales(ref: FirebaseFirestore.DocumentReference<SalesIntervalDoc>) {
  try {
    await ref.firestore.runTransaction(async (tx) => {
      const initialDoc = await tx.get(ref);
      if (!initialDoc.data()?.isAggregated) {
        const salesSnapshot = await tx.get(
          ref.collection(firestoreConstants.INTERVAL_SALES_COLL).where('isDeleted', '==', false)
        );
        const salesDocs = salesSnapshot.docs.map((item) => item.data());
        const sales = salesDocs.filter((sale) => !!sale) as NftSale[];
        const stats = Sales.getStats(sales);
        const { startTimestamp, endTimestamp } = parseAggregationId(ref.id, AggregationInterval.FiveMinutes);
        const updatedIntervalDoc: SalesIntervalDoc = {
          updatedAt: Date.now(),
          isAggregated: false,
          startTimestamp,
          endTimestamp,
          stats,
          hasUnaggregatedSales: false
        };
        for (const saleDoc of salesSnapshot.docs) {
          tx.set(saleDoc.ref, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
        }
        tx.update(ref, updatedIntervalDoc);
      }
    });
  } catch (err) {
    console.error('Failed to aggregate sales', err);
  }
}
