import * as functions from 'firebase-functions';

import { config } from '@/config/index';
import { aggregateSalesStats } from './save-sales-for-aggregation';

export const saveSalesToBeAggregated = functions
  .region(config.firebase.region)
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await aggregateSalesStats();
  });
