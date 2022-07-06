import { REGION } from '../utils/constants';
import * as functions from 'firebase-functions';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { FirestoreOrder, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { Order } from '../orders/order';
import { invalidatePendingOrderMatches } from './invalidate-pending-order-matches';
import { triggerScans } from './trigger-scan';

export const onOrderChange = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDERS_COLL}/{orderId}`)
  .onWrite(async (change) => {
    const prevOrder = change.before.data() as FirestoreOrder | undefined;
    const updatedOrder = change.after.data() as FirestoreOrder | undefined;
    try {
      switch (updatedOrder?.orderStatus) {
        case OBOrderStatus.ValidActive: {
          if (!updatedOrder.lastScannedAt || updatedOrder.lastScannedAt < Date.now() - 30_000) {
            const order = new Order(updatedOrder);
            const { matches, requiresScan } = await order.searchForMatches();
            await order.saveMatches(matches);
            await order.markScanned();
            await triggerScans(requiresScan);
          }
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
