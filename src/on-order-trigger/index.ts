import {
  FirestoreOrderMatch,
  FirestoreOrderMatches,
  FirestoreOrderMatchStatus,
  OrderMatchStatePending
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import * as functions from 'firebase-functions';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { REGION } from '../utils/constants';

export const onOrderTrigger = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    maxInstances: 3
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    try {
      const db = getDb();
      const orderMatches = db
        .collection(firestoreConstants.ORDER_MATCHES_COLL)
        .where('state.status', '==', FirestoreOrderMatchStatus.Inactive)
        .where('state.timestampValid', '<=', Date.now())
        .stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;

      /**
       * update the status of order matches to active
       */
      const batchHandler = new FirestoreBatchHandler();
      for await (const orderMatch of orderMatches) {
        const match = orderMatch.data() as FirestoreOrderMatch;
        const orderState: OrderMatchStatePending = {
          status: FirestoreOrderMatchStatus.Active,
          priceValid: match.state.priceValid,
          timestampValid: match.state.timestampValid
        };
        const stateUpdate: Pick<FirestoreOrderMatches, 'state'> = {
          state: orderState
        };
        batchHandler.add(orderMatch.ref, stateUpdate, { merge: true });
      }
      await batchHandler.flush();
    } catch (err) {
      console.log(err);
    }
  });
