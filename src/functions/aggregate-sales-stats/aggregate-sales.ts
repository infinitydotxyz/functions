import { ChainId, CollectionStats, NftSale, PreMergedRewardSaleEvent, RewardEventVariant, StatsPeriod } from '@infinityxyz/lib/types/core';
import { firestoreConstants, getCollectionDocId } from '@infinityxyz/lib/utils';



import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';


export async function aggregateSalesStats() {
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

        if (saleWithDocId.source === 'flow') {
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

        const saleUpdate: Pick<NftSale, 'isAggregated'> = {
          isAggregated: true
        };

        const collDocId = getCollectionDocId({
          collectionAddress: saleWithDocId.collectionAddress,
          chainId: saleWithDocId.chainId
        });
        const collStatsDoc = db
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(collDocId)
          .collection(firestoreConstants.COLLECTION_STATS_COLL)
          .doc(StatsPeriod.All);
          
        const statsData = (await tx.get(collStatsDoc)).data() as CollectionStats;
        if (statsData) {
          const dataToStore: Partial<CollectionStats> = {
            floorPrice: saleWithDocId.price < statsData.floorPrice ? saleWithDocId.price : statsData.floorPrice,
            numSales: statsData.numSales + 1,
            volume: statsData.volume + saleWithDocId.price,
            updatedAt: Date.now()
          };
          tx.set(collStatsDoc, dataToStore, { merge: true });
        }

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