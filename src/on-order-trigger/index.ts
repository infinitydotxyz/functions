import { FirestoreOrderMatch, FirestoreOrderMatchStatus } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import * as functions from 'firebase-functions';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { REGION } from '../utils/constants';

export const onOrderTrigger = functions
  .region(REGION)
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    try {
      const db = getDb();
      const orderMatches = db
        .collection(firestoreConstants.ORDER_MATCHES_COLL)
        .where('status', '==', FirestoreOrderMatchStatus.Inactive)
        .where('timestamp', '<=', Date.now())
        .stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;

      /**
       * update the status of order matches to active
       */
      const batchHandler = new FirestoreBatchHandler();
      for await (const orderMatch of orderMatches) {
        const matchOrderItems = await orderMatch.ref
          .collection(firestoreConstants.ORDER_MATCH_ITEMS_SUB_COLL)
          .listDocuments();
        for (const matchOrderItem of matchOrderItems) {
          batchHandler.add(matchOrderItem, { status: FirestoreOrderMatchStatus.Active }, { merge: true });
        }
        batchHandler.add(orderMatch.ref, { status: FirestoreOrderMatchStatus.Active }, { merge: true });
      }
      await batchHandler.flush();
    } catch (err) {
      console.log(err);
    }
  });
