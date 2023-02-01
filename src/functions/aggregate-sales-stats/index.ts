import * as functions from 'firebase-functions';

import { Stats } from '@infinityxyz/lib/types/core/Stats';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';

import { aggregateIntervalSales } from './aggregate-interval-stats';
import { aggregateCollectionStats } from './aggregate-stats';
import { retriggerAggregation } from './retrigger-aggregation';
import { saveSalesForAggregation } from './save-sales-for-aggregation';
import { SalesIntervalDoc } from './types';

export const saveSalesToBeAggregated = functions
  .region(config.firebase.region)
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await saveSalesForAggregation();
    await retriggerAggregation();
  });

export const aggregateCollectionSales = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.AGGREGATED_COLLECTION_SALES_COLL}/{intervalId}`
  )
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
      const statsCollectionRef = collectionRef.collection(
        firestoreConstants.COLLECTION_STATS_COLL
      ) as FirebaseFirestore.CollectionReference<Stats>;
      await aggregateCollectionStats(update as SalesIntervalDoc, intervalRef, statsCollectionRef);
    }
  });
