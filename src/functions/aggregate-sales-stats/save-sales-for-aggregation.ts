import {
  ChainId,
  NftSale,
  PreMergedRewardSaleEvent,
  RewardEventVariant,
  SaleSource
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';

import { AggregationInterval, SalesIntervalDoc } from './types';
import { getIntervalAggregationId } from './utils';

export async function saveSalesForAggregation() {
  const db = getDb();
  const unaggregatedSales = db
    .collection(firestoreConstants.SALES_COLL)
    .where('isAggregated', '==', false) as FirebaseFirestore.Query<NftSale>;
  const unaggregatedSalesStream = streamQueryWithRef(unaggregatedSales, (item, ref) => [ref], {
    pageSize: 300
  });

  const saveSale = async (ref: FirebaseFirestore.DocumentReference<NftSale>) => {
    try {
      await db.runTransaction(async (tx) => {
        const saleSnap = await tx.get(ref);
        const sale = saleSnap.data();
        if (!sale) {
          throw new Error(`Sale not found at ${ref.path}`);
        }
        const saleWithDocId = {
          ...sale,
          docId: ref.id,
          updatedAt: Date.now()
        };
        if (saleWithDocId.source === SaleSource.Infinity) {
          const saleEvent: PreMergedRewardSaleEvent = {
            ...saleWithDocId,
            discriminator: RewardEventVariant.Sale,
            chainId: saleWithDocId.chainId as ChainId,
            isMerged: false
          };
          const rewardsLedgerRef = db
            .collection(firestoreConstants.REWARDS_COLL)
            .doc(saleWithDocId.chainId)
            .collection('rewardsLedger');
          tx.set(rewardsLedgerRef.doc(), saleEvent);
        } else if (saleWithDocId.source === 'flow') {
          const saleEvent: PreMergedRewardSaleEvent = {
            ...(saleWithDocId as any),
            discriminator: RewardEventVariant.Sale,
            chainId: saleWithDocId.chainId as ChainId,
            isMerged: false
          };
          const flowRewardsLedger = db
            .collection(firestoreConstants.REWARDS_COLL)
            .doc(saleWithDocId.chainId)
            .collection('flowRewardsLedger');
          tx.set(flowRewardsLedger.doc(), saleEvent);
        }
        saveSaleToCollectionSales(saleWithDocId, tx);
        const saleUpdate: Pick<NftSale, 'isAggregated'> = {
          isAggregated: true
        };
        tx.update(ref, saleUpdate);
      });
    } catch (err) {
      console.error(err);
    }
  };

  for await (const { ref } of unaggregatedSalesStream) {
    await saveSale(ref);
  }
}

function saveSaleToCollectionSales(
  sale: NftSale & { docId: string; updatedAt: number },
  tx: FirebaseFirestore.Transaction
) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const collectionStatsRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(`${sale.chainId}:${sale.collectionAddress}`)
    .collection(firestoreConstants.AGGREGATED_COLLECTION_SALES_COLL)
    .doc(intervalId);
  const salesRef = collectionStatsRef.collection(firestoreConstants.INTERVAL_SALES_COLL);
  const saleRef = salesRef.doc(sale.docId);
  tx.set(saleRef, sale, { merge: false });
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(collectionStatsRef, statsDocUpdate, { merge: true });
}
