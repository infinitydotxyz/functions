import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { CurationLedgerEventType } from '../aggregate-sales-stats/curation.types';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';
import { REGION } from '../utils/constants';
import { CurationAggregator } from './curation-aggregator';
import { CurationMetadata } from './types';

export const triggerCurationLedgerAggregation = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0,30 * * * *') // every 30 min
  .onRun(async () => {
    /**
     * query for ledgers that need to be aggregated
     */
    const db = getDb();
    const curationEventsToAggregate = db
      .collectionGroup('curationLedger')
      .where('isAggregated', '==', false)
      .where('isDeleted', '==', false) as FirebaseFirestore.Query<CurationLedgerEventType>;
    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    const updates = new Set<string>();
    const batchHandler = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      const curationMetadataRef = ref.parent.parent;
      if (curationMetadataRef && !updates.has(curationMetadataRef.path)) {
        updates.add(curationMetadataRef.path);
        const curationMetadataUpdate: CurationMetadata = {
          updatedAt: Date.now(),
          ledgerRequiresAggregation: true
        };
        batchHandler.add(curationMetadataRef, curationMetadataUpdate, { merge: true });
      }
    }
    await batchHandler.flush();
  });

export const aggregateCurationLedger = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/curationCollection/curationMetadata`)
  .onWrite(async (change) => {
    const curationMetadata = change.after.data() as CurationMetadata | undefined;
    if (!curationMetadata) {
      return;
    } else if (curationMetadata.ledgerRequiresAggregation) {
      const curationMetadataRef = change.after.ref as FirebaseFirestore.DocumentReference<CurationMetadata>;
      const curationLedgerRef = curationMetadataRef.collection('curationLedger');
      const snapshot = await curationLedgerRef
        .where('isAggregated', '==', false)
        .where('isDeleted', '==', false)
        .orderBy('blockNumber', 'asc')
        .limit(1)
        .get();
      const firstUnaggregatedDoc = snapshot.docs[0];
      const firstUnaggregatedEvent = firstUnaggregatedDoc?.data() as CurationLedgerEventType | undefined;
      if (!firstUnaggregatedEvent) {
        console.error(`Failed to find unaggregated event for ${curationMetadataRef.path}`);
        return;
      }

      const curationBlockRange = CurationAggregator.getCurationBlockRange(firstUnaggregatedEvent.timestamp);
      const curationLedgerEventsQuery = curationLedgerRef
        .where('timestamp', '>=', curationBlockRange.startTimestamp)
        .orderBy('timestamp', 'asc') as FirebaseFirestore.Query<CurationLedgerEventType>;
      const curationLedgerEventsStream = streamQueryWithRef(curationLedgerEventsQuery, (item, ref) => [ref], {
        pageSize: 300
      });

      const events: CurationLedgerEventType[] = [];
      const eventsWithRefs = [];
      for await (const { data, ref } of curationLedgerEventsStream) {
        events.push({ ...data });
        eventsWithRefs.push({ ...data, ref });
      }

      const curationAggregator = new CurationAggregator(events, curationMetadataRef);
      await curationAggregator.aggregate();

      const batchHandler = new FirestoreBatchHandler();
      for (const event of eventsWithRefs) {
        const updatedEvent: Partial<CurationLedgerEventType> = {
          isAggregated: true,
          updatedAt: Date.now()
        };
        batchHandler.add(event.ref, updatedEvent, { merge: true });
      }
      await batchHandler.flush();
    }
  });