import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import { REGION } from '../../utils/constants';
import { triggerStakerContractPeriodAggregation } from './trigger-staker-contract-aggregation';
import { StakerContractPeriodDoc } from './types';

export const triggerStakerContractAggregation = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0 1 * * *')
  .onRun(async () => {
    const db = getDb();
    await triggerStakerContractPeriodAggregation(db);
  });

export const aggregateStakerContractPeriod = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    memory: '4GB'
  })
  .firestore.document(
    `${firestoreConstants.STAKING_CONTRACTS_COLL}/{stakerContractId}/stakerContractCurationPeriods/{periodId}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as StakerContractPeriodDoc;

    if (!after?.metadata?.trigger) {
      return;
    }

    await aggregateStakerContractPeriod(change.after.ref.firestore, after.metadata);
  });
