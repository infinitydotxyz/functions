import { StakerEvents } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { REGION } from '../../utils/constants';
import { handleStakerEvent } from './handle-staker-event';

export const onStakerEvent = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.STAKING_CONTRACTS_COLL}/{contractId}/${firestoreConstants.STAKING_LEDGER_COLL}/{eventId}`
  )
  .onWrite(async (change) => {
    const event = change.after.data() as StakerEvents | undefined;

    if (!event) {
      return;
    } else if (!event.processed) {
      await handleStakerEvent(event, change.after.ref as FirebaseFirestore.DocumentReference<StakerEvents>);
    }
  });

export const triggerStakerEvents = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const db = getDb();
    const stakingLedger = db.collectionGroup(firestoreConstants.STAKING_LEDGER_COLL);
    const tenMin = 1000 * 60 * 10;
    const maxProcessingDelay = tenMin;
    const unProcessedStakingEvents = stakingLedger
      .where('updatedAt', '<', Date.now() - maxProcessingDelay)
      .where('processed', '==', false) as FirebaseFirestore.Query<StakerEvents>;
    const stream = streamQueryWithRef(unProcessedStakingEvents, (item, ref) => [ref], { pageSize: 300 });
    let numTriggered = 0;
    const batch = new FirestoreBatchHandler();
    for await (const item of stream) {
      const trigger: Partial<StakerEvents> = {
        updatedAt: Date.now()
      };
      batch.add(item.ref, trigger, { merge: true });
      numTriggered += 1;
    }
    await batch.flush();
    console.log(`Trigger staker events triggered ${numTriggered} events to be processed`);
  });
