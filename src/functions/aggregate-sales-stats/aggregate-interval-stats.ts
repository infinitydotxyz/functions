import { NftSale } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { Sales } from './models/sales';
import { SalesIntervalDoc, AggregationInterval } from './types';
import { parseAggregationId } from './utils';

export async function aggregateIntervalSales(ref: FirebaseFirestore.DocumentReference<SalesIntervalDoc>) {
  try {
    let didUpdateIntervalDoc = false;
    const query = ref
      .collection(firestoreConstants.INTERVAL_SALES_COLL)
      .where('isDeleted', '==', false) as FirebaseFirestore.CollectionReference<NftSale>;
    const sales: Map<string, NftSale> = new Map();
    const { queryEmpty } = await paginatedTransaction(
      query,
      ref.firestore,
      { pageSize: 300, maxPages: 1000 },
      ({ data: salesSnapshot, txn, hasNextPage }) => {
        for (const snap of salesSnapshot.docs) {
          const sale = snap.data();
          const id = snap.id;
          if (id && sale) {
            sales.set(id, sale);
          }
          txn.set(snap.ref, { isAggregated: true, updatedAt: Date.now() } as any, { merge: true });
        }

        if (!hasNextPage) {
          const stats = Sales.getStats(sales.values());
          const { startTimestamp, endTimestamp } = parseAggregationId(ref.id, AggregationInterval.FiveMinutes);
          const updatedIntervalDoc: SalesIntervalDoc = {
            updatedAt: Date.now(),
            isAggregated: false,
            startTimestamp,
            endTimestamp,
            stats,
            hasUnaggregatedSales: !hasNextPage
          };
          didUpdateIntervalDoc = true;
          txn.update(ref, updatedIntervalDoc);
        }
      }
    );

    if (queryEmpty && !didUpdateIntervalDoc) {
      const stats = Sales.getStats(sales.values());
      const { startTimestamp, endTimestamp } = parseAggregationId(ref.id, AggregationInterval.FiveMinutes);
      const updatedIntervalDoc: SalesIntervalDoc = {
        updatedAt: Date.now(),
        isAggregated: false,
        startTimestamp,
        endTimestamp,
        stats,
        hasUnaggregatedSales: false
      };
      didUpdateIntervalDoc = true;
      await ref.update(updatedIntervalDoc);
    }
  } catch (err) {
    console.error('Failed to aggregate sales', err);
  }
}
