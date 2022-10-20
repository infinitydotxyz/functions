import { ChainId, NftSale, RewardSaleEvent, SaleSource } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { RewardsEventHandler } from '../../rewards/rewards-event-handler';
import { getTokenPairPrice } from '../../token-price';
import { USDC_MAINNET, WETH_MAINNET } from '../../token-price/constants';
import { getSaleReferral } from '../referrals/get-referrals';
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
  const rewardsEventHandler = new RewardsEventHandler(db);

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
        if (saleWithDocId.source === SaleSource.Infinity && saleWithDocId.chainId === ChainId.Mainnet) {
          const tokenPrice = await getTokenPairPrice(WETH_MAINNET, USDC_MAINNET);
          const asset = {
            collection: sale.collectionAddress,
            tokenId: sale.tokenId,
            chainId: sale.chainId as ChainId
          };
          const referral = await getSaleReferral(db, sale.buyer, asset);
          const saleEvent: RewardSaleEvent = {
            ...saleWithDocId,
            chainId: saleWithDocId.chainId as ChainId,
            ethPrice: tokenPrice.token1PerToken0,
            referral: referral ?? undefined
          };
          await rewardsEventHandler.onEvents(saleEvent.chainId as ChainId, [saleEvent], tx, db);
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
