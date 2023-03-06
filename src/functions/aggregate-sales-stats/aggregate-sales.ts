import {
  ChainId,
  CollectionStats,
  FlowNftSale,
  NftSale,
  PreMergedRewardSaleEvent,
  RewardEventVariant,
  StatsPeriod
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { DocRef, DocSnap } from '@/firestore/types';

export async function aggregateSalesStats() {
  const db = getDb();
  const unaggregatedSales = db
    .collection(firestoreConstants.SALES_COLL)
    .where('isAggregated', '==', false) as FirebaseFirestore.Query<NftSale>;
  const unaggregatedSalesStream = streamQueryPageWithRef(unaggregatedSales, (item, ref) => [ref], {
    pageSize: 150 // ~ 500 / 3 since we write to at most 3 documents per item
  });

  for await (const page of unaggregatedSalesStream) {
    const collections = [...new Set(page.map((item) => `${item.data.chainId}:${item.data.collectionAddress}`))].map(
      (collectionId) => {
        const collStatsDoc = db
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(collectionId)
          .collection(firestoreConstants.COLLECTION_STATS_COLL)
          .doc(StatsPeriod.All) as DocRef<CollectionStats>;

        return collStatsDoc;
      }
    );
    const collectionStatsSnaps = (await db.getAll(...collections)) as DocSnap<CollectionStats>[];

    const sortedItems = page.sort((itemA, itemB) => {
      return itemA.data.price - itemB.data.price;
    });
    const updatedCollectionStats = new Set();

    // eslint-disable-next-line @typescript-eslint/require-await
    await db.runTransaction(async (tx) => {
      for (const { data, ref } of sortedItems) {
        const saleWithDocId: NftSale & { docId: string; updatedAt: number } = {
          ...data,
          docId: ref.id,
          updatedAt: Date.now()
        };

        if (saleWithDocId.source === 'flow') {
          const saleEvent: PreMergedRewardSaleEvent = {
            ...(saleWithDocId as FlowNftSale & { docId: string; updatedAt: number }),
            source: saleWithDocId.source,
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

        const saleUpdate: Pick<NftSale, 'isAggregated'> = {
          isAggregated: true
        };

        const collDocId = getCollectionDocId({
          collectionAddress: saleWithDocId.collectionAddress,
          chainId: saleWithDocId.chainId
        });

        if (!updatedCollectionStats.has(collDocId)) {
          const collectionStats = collectionStatsSnaps.find((item) => item.ref.path.includes(collDocId));
          if (collectionStats) {
            const statsData = collectionStats.data();
            if (statsData) {
              const dataToStore: Partial<CollectionStats> = {
                floorPrice: saleWithDocId.price < statsData.floorPrice ? saleWithDocId.price : statsData.floorPrice,
                numSales: statsData.numSales + 1,
                volume: statsData.volume + saleWithDocId.price,
                updatedAt: Date.now()
              };
              tx.set(collectionStats.ref, dataToStore, { merge: true });
              updatedCollectionStats.add(collDocId);
            }
          }
        }

        tx.update(ref, saleUpdate);
      }
    });
  }
}
