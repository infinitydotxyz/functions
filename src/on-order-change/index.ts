import { REGION } from '../utils/constants';
import * as functions from 'firebase-functions';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';

export const onOrderChange = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDERS_COLL}/{orderId}`)
  .onUpdate((change) => {
    // const prevOrder = change.before.data() as FirestoreOrder | undefined;
    const updatedOrder = change.after.data() as FirestoreOrder | undefined;

    /**
     * if now valid
     * - find best order, attempt to fulfill, save as trigger
     * else if no longer valid
     * - clean up: remove triggers for this order
     */
    // const orderItems = await change.after.ref.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL).get();

    switch (updatedOrder?.orderStatus) {
      case OBOrderStatus.ValidActive:
        /**
         * attempt to find a match
         * if match is found
         *  - fulfill
         *  - save as trigger
         */

        break;
      case OBOrderStatus.ValidInactive:
      case OBOrderStatus.Invalid:
      default:
        /**
         * check for any triggers for this order
         * remove them if found
         */

        break;
    }
  });
