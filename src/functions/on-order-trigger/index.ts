import * as functions from 'firebase-functions';

import {
  FirestoreOrderMatch,
  FirestoreOrderMatchStatus,
  FirestoreOrderMatches,
  OrderMatchStatePending
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';

export const onOrderTrigger = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
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
      const batchHandler = new BatchHandler();
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
