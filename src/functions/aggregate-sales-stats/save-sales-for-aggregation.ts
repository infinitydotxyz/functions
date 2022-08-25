import { ChainId, InfinityNftSale, NftSale, SaleSource } from '@infinityxyz/lib/types/core';
import { CurationLedgerEvent, CurationLedgerSale } from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { AggregationInterval, SalesIntervalDoc } from './types';
import { getIntervalAggregationId, getRelevantStakerContracts } from './utils';

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
          saveSaleToCollectionCurationLedgers(saleWithDocId, tx);
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
  };

  for await (const { ref } of unaggregatedSalesStream) {
    await saveSale(ref);
  }
}

function saveSaleToCollectionCurationLedgers(
  sale: InfinityNftSale & { docId: string; updatedAt: number },
  tx: FirebaseFirestore.Transaction
) {
  const db = getDb();
  const stakerContracts = getRelevantStakerContracts(sale);
  const curationSales = stakerContracts.map((stakerContract) => {
    const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
      sale.chainId as ChainId,
      stakerContract
    );
    const curationSale: CurationLedgerSale = {
      ...sale,
      discriminator: CurationLedgerEvent.Sale,
      chainId: sale.chainId as ChainId,
      collectionAddress: sale.collectionAddress,
      collectionChainId: sale.chainId as ChainId,
      stakerContractAddress: stakerContract,
      stakerContractChainId: sale.chainId as ChainId,
      isStakeMerged: true,
      tokenContractAddress,
      tokenContractChainId,
      isAggregated: false
    };
    return curationSale;
  });

  for (const curationSale of curationSales) {
    const collectionDocRef = db
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(`${curationSale.collectionChainId}:${curationSale.collectionAddress}`);
    const stakerContractDocRef = collectionDocRef
      .collection(firestoreConstants.COLLECTION_CURATION_COLL)
      .doc(`${curationSale.stakerContractChainId}:${curationSale.stakerContractAddress}`);
    const saleRef = stakerContractDocRef.collection(firestoreConstants.CURATION_LEDGER_COLL).doc(sale.docId);
    tx.set(saleRef, curationSale, { merge: false });
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

function saveSaleToNftSales(sale: NftSale & { docId: string; updatedAt: number }, tx: FirebaseFirestore.Transaction) {
  const db = getDb();
  const intervalId = getIntervalAggregationId(sale.timestamp, AggregationInterval.FiveMinutes);
  const nftStatsRef = db
    .collection(firestoreConstants.COLLECTIONS_COLL)
    .doc(`${sale.chainId}:${sale.collectionAddress}`)
    .collection(firestoreConstants.COLLECTION_NFTS_COLL)
    .doc(sale.tokenId)
    .collection(firestoreConstants.AGGREGATED_NFT_SALES_COLL)
    .doc(intervalId);
  const salesRef = nftStatsRef.collection(firestoreConstants.INTERVAL_SALES_COLL);
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
    .collection(firestoreConstants.MARKETPLACE_STATS_COLL)
    .doc(sale.source)
    .collection(firestoreConstants.AGGREGATED_SOURCE_SALES_COLL)
    .doc(intervalId);
  const salesRef = sourceStatsRef.collection(firestoreConstants.INTERVAL_SALES_COLL);
  const saleRef = salesRef.doc(sale.docId);
  tx.set(saleRef, sale, { merge: false });
  const statsDocUpdate: Partial<SalesIntervalDoc> = {
    updatedAt: Date.now(),
    hasUnaggregatedSales: true
  };
  tx.set(sourceStatsRef, statsDocUpdate, { merge: true });
}
