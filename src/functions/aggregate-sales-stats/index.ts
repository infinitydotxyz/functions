import * as functions from 'firebase-functions';

import { config } from '@/config/index';
import { aggregateSalesStats } from './aggregate-sales';

export const saveSalesToBeAggregated = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 55, maxInstances: 1 })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await aggregateSalesStats();
  });
