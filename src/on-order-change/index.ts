import { REGION } from '../utils/constants';
import * as functions from 'firebase-functions';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { Order } from '../orders/order';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { FirestoreOrderMatch } from '../orders/orders.types';

export const onOrderChange = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDERS_COLL}/{orderId}`)
  .onUpdate(async (change) => {
    const prevOrder = change.before.data() as FirestoreOrder | undefined;
    const updatedOrder = change.after.data() as FirestoreOrder | undefined;
    try {
      switch (updatedOrder?.orderStatus) {
        case OBOrderStatus.ValidActive: {
          const order = new Order(updatedOrder);
          const matches = await order.searchForMatches();
          matches.sort((a, b) => a.timestamp - b.timestamp);
          if (matches?.[0] && matches[0].timestamp <= Date.now()) {
            // TODO fulfill order
          } else {
            await order.saveMatches(matches);
          }
          break;
        }
        case OBOrderStatus.ValidInactive:
        case OBOrderStatus.Invalid:
        default: {
          const db = getDb();
          const id = updatedOrder?.id ?? prevOrder?.id;
          if (id) {
            const triggers = db
              .collectionGroup('orderMatches')
              .where('id', '==', updatedOrder?.id)
              .stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<FirestoreOrderMatch>>;
            const batchHandler = new FirestoreBatchHandler();
            for await (const trigger of triggers) {
              batchHandler.delete(trigger.ref);
            }
            await batchHandler.flush();
          }
          break;
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
