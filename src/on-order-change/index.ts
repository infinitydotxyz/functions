import { REGION } from '../utils/constants';
import * as functions from 'firebase-functions';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { Order } from '../orders/order';
import { invalidatePendingOrderMatches } from './invalidate-pending-order-matches';

export const onOrderChange = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDERS_COLL}/{orderId}`)
  .onWrite(async (change) => {
    const prevOrder = change.before.data() as FirestoreOrder | undefined;
    const updatedOrder = change.after.data() as FirestoreOrder | undefined;
    try {
      switch (updatedOrder?.orderStatus) {
        case OBOrderStatus.ValidActive: {
          const order = new Order(updatedOrder);
          const matches = await order.searchForMatches();
          matches.sort((a, b) => a.state.timestampValid - b.state.timestampValid);
          await order.saveMatches(matches);
          break;
        }
        case OBOrderStatus.ValidInactive:
        case OBOrderStatus.Invalid:
        default: {
          const id = updatedOrder?.id ?? prevOrder?.id;
          const requiresUpdate = prevOrder?.orderStatus !== updatedOrder?.orderStatus;
          if (id && requiresUpdate) {
            await invalidatePendingOrderMatches(id, updatedOrder?.orderStatus ?? OBOrderStatus.Invalid);
          }
          break;
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
