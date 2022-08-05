import { ChainId, InfinityNftSale, NftSale, SaleSource, StatsPeriod } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import { streamQueryWithRef } from '../firestore/stream-query';
import { CurationLedgerEvent, curationLedgerEventPriority, CurationLedgerSale } from './curation.types';
import { AggregationInterval, SalesIntervalDoc } from './types';
import { getIntervalAggregationId, getStatsDocInfo } from './utils';

export async function saveSalesForAggregation() {
  const db = getDb();
  const unaggregatedSales = db
    .collection(firestoreConstants.SALES_COLL)
    .where('isAggregated', '==', false) as FirebaseFirestore.Query<NftSale | undefined>;
  const unaggregatedSalesStream = streamQueryWithRef(unaggregatedSales, (item, ref) => [ref], {
    pageSize: 300
  });

  const salesArray: {
    sale: NftSale & { docId: string };
    ref: FirebaseFirestore.DocumentReference<NftSale | undefined>;
  }[] = [];
  for await (const { data, ref } of unaggregatedSalesStream) {
    if (data) {
      salesArray.push({ sale: { ...data, docId: ref.id }, ref });
    }
  }

  for (const { ref } of salesArray) {
    try {
      await db.runTransaction(async (tx) => {
        const saleSnap = await tx.get(ref);
        const sale = saleSnap.data();
        if (!sale) {
          return;
        }
        const saleWithDocId = {
          ...sale,
          docId: ref.id,
          updatedAt: Date.now()
        };
        if(saleWithDocId.source === SaleSource.Infinity) { 
          saveSaleToCollectionCurationLedger(saleWithDocId, tx);
        }
        saveSaleToCollectionSales(saleWithDocId, tx);
        saveSaleToNftSales(saleWithDocId, tx);
        saveSaleToSourceSales(saleWithDocId, tx);
        const saleUpdate: Pick<NftSale, 'isAggregated'> = {
          isAggregated: true
        };
        tx.update(ref, saleUpdate);
      });
    } catch (err) {
      console.error(err);
    }
  }
}

function saveSaleToCollectionCurationLedger(
  sale: InfinityNftSale & { docId: string; updatedAt: number },
  tx: FirebaseFirestore.Transaction
) {
  const db = getDb();
  const curationSale: CurationLedgerSale = { ...sale, address: sale.collectionAddress, chainId: sale.chainId as ChainId, discriminator: CurationLedgerEvent.Sale };
  const collectionDocRef =  db
  .collection(firestoreConstants.COLLECTIONS_COLL)
  .doc(`${sale.chainId}:${sale.collectionAddress}`);
  const saleRef = collectionDocRef
    .collection('curationLedger')
    .doc(sale.docId);
  tx.set(saleRef, curationSale, { merge: false });
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
    .collection('aggregatedCollectionSales')
    .doc(intervalId);
  const salesRef = collectionStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId);
  tx.set(saleRef, sale, { merge: false });
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(collectionStatsRef, statsDocUpdate, { merge: true });
}

function saveSaleToNftSales(sale: NftSale & { docId: string; updatedAt: number }, tx: FirebaseFirestore.Transaction) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const nftStatsRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(`${sale.chainId}:${sale.collectionAddress}`)
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(sale.tokenId)
    .collection('aggregatedNftSales')
    .doc(intervalId);
  const salesRef = nftStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId);
  tx.set(saleRef, sale, { merge: false });
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(nftStatsRef, statsDocUpdate, { merge: true });
}

function saveSaleToSourceSales(
  sale: NftSale & { docId: string; updatedAt: number },
  tx: FirebaseFirestore.Transaction
) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const sourceStatsRef = db
    .collection('marketplaceStats')
    .doc(sale.source)
    .collection('aggregatedSourceSales')
    .doc(intervalId);
  const salesRef = sourceStatsRef.collection('intervalSales');
  const saleRef = salesRef.doc(sale.docId);
  tx.set(saleRef, sale, { merge: false });
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(sourceStatsRef, statsDocUpdate, { merge: true });
}
