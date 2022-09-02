import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import { REGION } from '../../utils/constants';

const triggerStakerContractAggregation = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0 1 * * *')
  .onRun(async (context) => {
    const db = getDb();
    await triggerStakerContractAggregation(db);
  });
