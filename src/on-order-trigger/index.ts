import * as functions from 'firebase-functions';
import { getDb } from '../firestore';
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
        .where('timestamp', '>=', Date.now())
        .stream() as AsyncIterable<FirestoreOrderMatch>;

      for await (const orderMatch of orderMatches) {
        // TODO execute order and delete order match
      }
    } catch (err) {
      console.log(err);
    }
  });
