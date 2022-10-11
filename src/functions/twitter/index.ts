import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import { REGION } from '../../utils/constants';
import { updateMentions } from './update-mentions';

export const updateMentionProfiles = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .pubsub.schedule('every 1 days')
  .onRun(async () => {
    const db = getDb();
    await updateMentions(db);
  });
