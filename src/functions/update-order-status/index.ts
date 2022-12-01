import * as functions from 'firebase-functions';

import { config } from '@/config/index';

import { markExpiredOrdersInvalid } from './mark-expired-orders-invalid';
import { markOrdersValidActive } from './mark-orders-valid-active';

export const updateOrderStatus = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    try {
      const ordersInvalidPromise = markExpiredOrdersInvalid();
      const ordersValidActivePromise = markOrdersValidActive();
      const results = await Promise.allSettled([ordersInvalidPromise, ordersValidActivePromise]);
      const errors = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
      if (errors.length > 0) {
        const reasons = errors.map((error) => error.reason);
        throw new Error(reasons.join(', '));
      }
    } catch (err) {
      console.log(err);
    }
  });
