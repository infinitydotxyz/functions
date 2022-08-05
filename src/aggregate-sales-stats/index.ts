import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { REGION } from '../utils/constants';
import { aggregateIntervalSales } from './aggregate-interval-stats';
import { aggregateCollectionStats, aggregateNftStats, aggregateSourceStats } from './aggregate-stats';
import { retriggerAggregation } from './retrigger-aggregation';
import { saveSalesForAggregation } from './save-sales-for-aggregation';
import { SalesIntervalDoc } from './types';

export const saveSalesToBeAggregated = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0,5,10,15,20,25,30,35,40,45,50,55 * * * *') // every 5 min
  .onRun(async () => {
    await saveSalesForAggregation();
    await retriggerAggregation();
  });

export const aggregateCollectionSales = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(`${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/aggregatedCollectionSales/{intervalId}`)
  .onWrite(async (change) => {
    const update = change.after.data() as Partial<SalesIntervalDoc>;
    if (update.hasUnaggregatedSales === true) {
      await aggregateIntervalSales(change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>);
    } else if (!!update.stats && !update.isAggregated && update.startTimestamp && update.endTimestamp) {
      const intervalRef = change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>;
      const collectionRef = intervalRef.parent.parent;
      if (!collectionRef) {
        throw new Error('No collection ref found');
      }
      const statsCollectionRef = collectionRef.collection(firestoreConstants.COLLECTION_STATS_COLL);
      await aggregateCollectionStats(update as SalesIntervalDoc, intervalRef, statsCollectionRef);
    }
  });

export const aggregateNftSales = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_NFTS_COLL}/{tokenId}/aggregatedNftSales/{intervalId}`
  )
  .onWrite(async (change) => {
    const update = change.after.data() as Partial<SalesIntervalDoc>;
    if (update.hasUnaggregatedSales === true) {
      await aggregateIntervalSales(change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>);
    } else if (!!update.stats && !update.isAggregated && update.startTimestamp && update.endTimestamp) {
      const intervalRef = change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>;
      const nftRef = intervalRef.parent.parent;
      if (!nftRef) {
        throw new Error('No collection ref found');
      }
      const statsCollectionRef = nftRef.collection(firestoreConstants.NFT_STATS_COLL);
      await aggregateNftStats(update as SalesIntervalDoc, intervalRef, statsCollectionRef);
    }
  });

export const aggregateSourceSales = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(`marketplaceStats/{saleSource}/aggregatedSourceSales/{intervalId}`)
  .onWrite(async (change) => {
    const update = change.after.data() as Partial<SalesIntervalDoc>;
    if (update.hasUnaggregatedSales === true) {
      await aggregateIntervalSales(change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>);
    } else if (!!update.stats && !update.isAggregated && update.startTimestamp && update.endTimestamp) {
      const intervalRef = change.after.ref as FirebaseFirestore.DocumentReference<SalesIntervalDoc>;
      const sourceStatsRef = intervalRef.parent.parent;
      if (!sourceStatsRef) {
        throw new Error('No collection ref found');
      }
      const statsCollectionRef = sourceStatsRef.collection('sourceStats');
      await aggregateSourceStats(update as SalesIntervalDoc, intervalRef, statsCollectionRef);
    }
  });
