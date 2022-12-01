import * as functions from 'firebase-functions';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { updateMentions } from './update-mentions';

export const updateMentionProfiles = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    const db = getDb();
    await updateMentions(db);
  });
