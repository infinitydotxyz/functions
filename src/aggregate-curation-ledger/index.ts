import { ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { CurationLedgerEventType } from '../aggregate-sales-stats/curation.types';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';
import { REGION } from '../utils/constants';
import { aggregateLedger } from './aggregate-ledger';
import { aggregatePeriods } from './aggregate-periods';
import { CurationMetadata } from './types';
import {
  getCurrentBlocks,
  getCurrentCurationSnippet,
  getCurrentPeriods,
  saveCurrentCurationSnippet
} from './update-current-curation-snippet';

export const triggerCurationLedgerAggregation = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0,10,20,30,40,50 * * * *') 
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
        const curationMetadataUpdate: Partial<CurationMetadata> = {
          updatedAt: Date.now(),
          ledgerRequiresAggregation: true,
          periodsRequireAggregation: false
        };
        batchHandler.add(curationMetadataRef, curationMetadataUpdate, { merge: true });
      }
    }
    await batchHandler.flush();
  });

export const aggregateCuration = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/curationCollection/curationMetadata`)
  .onWrite(async (change, context) => {
    const curationMetadata = change.after.data() as CurationMetadata | undefined;
    const [chainId, collectionAddress] = context.params.collectionId.split(':') as [ChainId, string];
    const curationMetadataRef = change.after.ref as FirebaseFirestore.DocumentReference<CurationMetadata>;
    if (!curationMetadata) {
      return;
    } else if (curationMetadata.ledgerRequiresAggregation) {
      await aggregateLedger(curationMetadataRef, collectionAddress, chainId);
      const triggerPeriodAggregationUpdate: Partial<CurationMetadata> = {
        ledgerRequiresAggregation: false,
        updatedAt: Date.now(),
        periodsRequireAggregation: true
      };
      await curationMetadataRef.set(triggerPeriodAggregationUpdate, { merge: true });
    } else if (curationMetadata.periodsRequireAggregation) {
      await aggregatePeriods(curationMetadataRef, collectionAddress, chainId);
      const metadataUpdate: Partial<CurationMetadata> = {
        periodsRequireAggregation: false,
        currentSnippetRequiresAggregation: true,
        updatedAt: Date.now()
      };
      await curationMetadataRef.set(metadataUpdate, { merge: true });
    } else if (curationMetadata.currentSnippetRequiresAggregation) {
      const currentBlocks = await getCurrentBlocks(curationMetadataRef);
      const currentPeriods = await getCurrentPeriods(curationMetadataRef);
      const currentSnippet = getCurrentCurationSnippet(currentPeriods, currentBlocks);
      await saveCurrentCurationSnippet(currentSnippet, curationMetadataRef);
      const metadataUpdate: Partial<CurationMetadata> = {
        currentSnippetRequiresAggregation: false,
        updatedAt: Date.now()
      };
      await curationMetadataRef.set(metadataUpdate, { merge: true });
    }
  });
