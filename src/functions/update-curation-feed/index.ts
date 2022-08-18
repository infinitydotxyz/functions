import {
  CurationLedgerEvents,
  CurationLedgerSale,
  CurationVotesAdded,
  CurationVotesRemoved
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../../firestore';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { REGION } from '../../utils/constants';
import { createFeedEventForLedgerEvent } from './create-feed-event';
import * as functions from 'firebase-functions';

export const saveLedgerEventsToFeed = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_CURATION_COLL}/{stakingContractId}/${firestoreConstants.CURATION_LEDGER_COLL}/{ledgerEventId}`
  )
  .onCreate(async (snap) => {
    const ledgerEvent = snap.data() as CurationLedgerSale | CurationVotesAdded | CurationVotesRemoved;
    if ('isFeedUpdated' in ledgerEvent && !ledgerEvent.isFeedUpdated) {
      await createFeedEventForLedgerEvent(snap.ref as FirebaseFirestore.DocumentReference<CurationLedgerEvents>);
    }
  });

export const backupSaveLedgerEventsToFeed = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0,10,20,30,40,50 * * * *')
  .onRun(async () => {
    const db = getDb();
    const tenMin = 1000 * 60 * 10;
    const curationEventsToAggregate = db
      .collectionGroup(firestoreConstants.CURATION_LEDGER_COLL)
      .where('isFeedUpdated', '==', false)
      .where('updatedAt', '<', Date.now() - tenMin);

    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    for await (const { ref, data: ledgerEvent } of stream) {
      if ('isFeedUpdated' in ledgerEvent && !ledgerEvent.isFeedUpdated) {
        await createFeedEventForLedgerEvent(ref as FirebaseFirestore.DocumentReference<CurationLedgerEvents>);
      }
    }
  });
