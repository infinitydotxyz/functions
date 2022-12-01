import * as functions from 'firebase-functions';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { syncOrderEvents } from './sync-order-events';

export const syncOrderStatusEvents = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 540, maxInstances: 1 })
  .pubsub.schedule('every 9 minutes')
  .onRun(async () => {
    const db = getDb();
    const stopIn = ONE_MIN * 8.5;
    await syncOrderEvents(db, stopIn, { pollInterval: 1000 * 15 });
  });
