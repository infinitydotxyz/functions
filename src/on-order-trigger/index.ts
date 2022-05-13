import * as functions from 'firebase-functions';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { FirestoreOrderMatch } from '../orders/orders.types';
import { REGION } from '../utils/constants';

export const onOrderTrigger = functions
  .region(REGION)
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    try {
      const db = getDb();
      const orderMatches = db
        .collectionGroup('orderMatches')
        .where('status', '==', 'inactive')
        .where('timestamp', '>=', Date.now())
        .stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;

      /**
       * update the status of order matches to active
       */
      const batchHandler = new FirestoreBatchHandler();
      for await (const orderMatch of orderMatches) {
        batchHandler.add(orderMatch.ref, { status: 'active' }, { merge: true });
      }
      await batchHandler.flush();
    } catch (err) {
      console.log(err);
    }
  });
