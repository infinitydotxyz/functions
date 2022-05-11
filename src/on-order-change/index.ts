import { REGION } from '../utils/constants';
import * as functions from 'firebase-functions';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { Order } from '../orders/order';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';

export const onOrderChange = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDERS_COLL}/{orderId}`)
  .onUpdate(async (change) => {
    const prevOrder = change.before.data() as FirestoreOrder | undefined;
    const updatedOrder = change.after.data() as FirestoreOrder | undefined;

    switch (updatedOrder?.orderStatus) {
      case OBOrderStatus.ValidActive: {
        /**
         * attempt to find a match
         * if match is found
         *  - fulfill
         *  - save as trigger
         */
        try {
          const order = new Order(updatedOrder);
          const matches = await order.searchForMatches();
          // sort matches by timestamp ascending
          matches.sort((a, b) => a.timestamp - b.timestamp);
          if (matches?.[0] && matches[0].timestamp <= Date.now()) {
            // TODO fulfill order
          } else {
            await order.saveMatches(matches);
          }
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case OBOrderStatus.ValidInactive:
      case OBOrderStatus.Invalid:
      default:
        try {
          // const db = getDb();
          const id = updatedOrder?.id ?? prevOrder?.id;
          if(id) {
            // const triggers = db.collectionGroup('orderMatches').where('id', '==', updatedOrder?.id).stream();
            // TODO delete all triggers
          }
        } catch (err) {
          console.error(err);
        }
        break;
    }
  });
