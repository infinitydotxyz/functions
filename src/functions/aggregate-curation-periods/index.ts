import * as functions from 'firebase-functions';

import { StakerContractPeriodDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { aggregateStakerContractPeriods } from './aggregate-staker-contract-periods';
import { triggerStakerContractPeriodAggregation } from './trigger-staker-contract-aggregation';

export const triggerStakerContractAggregation = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    const db = getDb();
    await triggerStakerContractPeriodAggregation(db);
  });

export const aggregateStakerContractPeriod = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .firestore.document(
    `${firestoreConstants.STAKING_CONTRACTS_COLL}/{stakerContractId}/stakerContractCurationPeriods/{periodId}`
  )
  .onWrite(async (change) => {
    const after = change.after.data() as StakerContractPeriodDoc;

    if (!after?.metadata?.trigger) {
      return;
    }

    await aggregateStakerContractPeriods(change.after.ref.firestore, after.metadata);
  });
