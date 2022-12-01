import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import { REGION } from '../../utils/constants';
import { ONE_MIN } from '@infinityxyz/lib/utils';
import { syncOrderEvents } from './sync-order-events';

export const syncOrderStatusEvents = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 9 minutes')
  .onRun(async () => {
    const db = getDb();
    const stopIn = ONE_MIN * 8.5;
    await syncOrderEvents(db, stopIn, { pollInterval: 1000 * 15 });
  });

