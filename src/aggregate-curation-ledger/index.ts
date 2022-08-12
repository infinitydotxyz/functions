import { ChainId } from '@infinityxyz/lib/types/core';
import { CurationLedgerEventType } from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
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
      .collectionGroup(firestoreConstants.CURATION_LEDGER_COLL)
      .where('isAggregated', '==', false)
      .where('isDeleted', '==', false) as FirebaseFirestore.Query<CurationLedgerEventType>;
    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    const updates = new Set<string>();
    const batchHandler = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      const stakerContractMetadataRef = ref.parent.parent;
      const collectionRef = stakerContractMetadataRef?.parent?.parent;
      if (stakerContractMetadataRef && collectionRef && !updates.has(stakerContractMetadataRef.path)) {
        const [stakerContractChainId, stakerContractAddress] = stakerContractMetadataRef.id.split(':') as [
          ChainId,
          string
        ];
        const [collectionChainId, collectionAddress] = collectionRef.id.split(':') as [ChainId, string];
        updates.add(stakerContractMetadataRef.path);
        const curationMetadataUpdate: Partial<CurationMetadata> = {
          updatedAt: Date.now(),
          ledgerRequiresAggregation: true,
          periodsRequireAggregation: false,
          collectionAddress,
          collectionChainId,
          stakerContractAddress,
          stakerContractChainId
        };
        batchHandler.add(stakerContractMetadataRef, curationMetadataUpdate, { merge: true });
      }
    }
    await batchHandler.flush();
  });

export const aggregateCuration = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_CURATION_COLL}/{stakingContractId}`
  )
  .onWrite(async (change, context) => {
    const [stakerContractChainId, stakerContractAddress] = context.params.stakingContractId.split(':') as [
      ChainId,
      string
    ];
    const stakerContractMetadata = change.after.data() as CurationMetadata | undefined;
    const [collectionChainId, collectionAddress] = context.params.collectionId.split(':') as [ChainId, string];
    const stakerContractMetadataRef = change.after.ref as FirebaseFirestore.DocumentReference<CurationMetadata>;
    if (!stakerContractMetadata) {
      return;
    } else if (stakerContractMetadata.ledgerRequiresAggregation) {
      await aggregateLedger(
        stakerContractMetadataRef,
        collectionAddress,
        collectionChainId,
        stakerContractAddress,
        stakerContractChainId
      );
      const triggerPeriodAggregationUpdate: Partial<CurationMetadata> = {
        ledgerRequiresAggregation: false,
        updatedAt: Date.now(),
        periodsRequireAggregation: true,
        collectionAddress,
        collectionChainId,
        stakerContractAddress,
        stakerContractChainId
      };
      await stakerContractMetadataRef.set(triggerPeriodAggregationUpdate, { merge: true });
    } else if (stakerContractMetadata.periodsRequireAggregation) {
      await aggregatePeriods(
        stakerContractMetadataRef,
        collectionAddress,
        collectionChainId,
        stakerContractAddress,
        stakerContractChainId
      );
      const metadataUpdate: Partial<CurationMetadata> = {
        periodsRequireAggregation: false,
        currentSnippetRequiresAggregation: true,
        updatedAt: Date.now()
      };
      await stakerContractMetadataRef.set(metadataUpdate, { merge: true });
    } else if (stakerContractMetadata.currentSnippetRequiresAggregation) {
      const currentBlocks = await getCurrentBlocks(stakerContractMetadataRef);
      const currentPeriods = await getCurrentPeriods(stakerContractMetadataRef);
      const currentSnippet = getCurrentCurationSnippet(
        currentPeriods,
        currentBlocks,
        stakerContractAddress,
        stakerContractChainId
      );
      await saveCurrentCurationSnippet(currentSnippet, stakerContractMetadataRef);
      const metadataUpdate: Partial<CurationMetadata> = {
        currentSnippetRequiresAggregation: false,
        updatedAt: Date.now()
      };
      await stakerContractMetadataRef.set(metadataUpdate, { merge: true });
    }
  });
