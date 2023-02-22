import * as functions from 'firebase-functions';
import { join, normalize } from 'path';
import phin from 'phin';

import { config } from '@/config/index';

export const fetchTrendingCollections = functions
  .region(config.firebase.region)
  .runWith({ timeoutSeconds: 530, maxInstances: 1 })
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    // call BE API endpoint using phin
    if (config.flow.serverBaseUrl) {
      const url = new URL(normalize(join(config.flow.serverBaseUrl, '/collections/update-trending-colls')));
      try {
        await phin({
          url: url.toString(),
          method: 'PUT'
        });
      } catch (error) {
        console.log('Error calling update-trending-colls api', error);
      }
    }
  });
