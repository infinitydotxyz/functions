import * as functions from 'firebase-functions';
import phin from 'phin';

import { config, PROD_SERVER_BASE_URL } from '@/config/index';

export const fetchTrendingCollections = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 530, maxInstances: 1 })
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    // call BE API endpoint using phin
    try {
      await phin({
        url: `${PROD_SERVER_BASE_URL}collections/update-trending-colls`,
        method: 'PUT'
      });
    } catch (error) {
      console.log('Error calling update-trending-colls api', error);
    }
  });
