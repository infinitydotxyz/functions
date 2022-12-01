import * as functions from 'firebase-functions';

import { CurationLedgerEventType, CurationLedgerEvents } from '@infinityxyz/lib/types/core/curation-ledger';
import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';

import { handlerStakerContractMetadata } from './handle-staker-contract-metadata-update';
import { mergeStake } from './merge-stake';
import { triggerCurationAggregation } from './trigger-curation-aggregation';
import { CurationMetadata } from './types';

export const onCurationLedgerEvent = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_CURATION_COLL}/{stakerContractId}/${firestoreConstants.CURATION_LEDGER_COLL}/{eventId}`
  )
  .onWrite(async (change) => {
    const curationLedgerEvent = change.after.data() as CurationLedgerEvents;
    if (curationLedgerEvent.isStakeMerged === false) {
      const curationLedgerEventRef = change.after.ref as FirebaseFirestore.DocumentReference<CurationLedgerEvents>;
      await mergeStake(curationLedgerEventRef);
      /**
       * attempt to trigger aggregation so curation data updates within seconds instead of minutes
       */
      await triggerCurationAggregation(curationLedgerEventRef);
    }
  });

export const triggerCurationLedgerEventMerge = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 2 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = ONE_MIN * 2;
    const curationEventsToAggregate = db
      .collectionGroup(firestoreConstants.CURATION_LEDGER_COLL)
      .where('isStakeMerged', '==', false)
      .where('isDeleted', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge) as FirebaseFirestore.Query<CurationLedgerEventType>;

    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    const batch = new BatchHandler();
    for await (const item of stream) {
      const triggerUpdate: Partial<CurationLedgerEventType> = {
        updatedAt: Date.now()
      };
      batch.add(item.ref, triggerUpdate, { merge: true });
    }
  });

export const triggerCurationLedgerAggregation = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 2 minutes')
  .onRun(async () => {
    /**
     * query for ledgers that need to be aggregated
     */
    const db = getDb();
    const curationEventsToAggregate = db
      .collectionGroup(firestoreConstants.CURATION_LEDGER_COLL)
      .where('isAggregated', '==', false)
      .where('isStakeMerged', '==', true)
      .where('isDeleted', '==', false) as FirebaseFirestore.Query<CurationLedgerEvents>;

    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    const updates = new Set<string>();
    const batchHandler = new BatchHandler();
    for await (const { ref } of stream) {
      const stakerContractMetadataRef = ref.parent.parent as FirebaseFirestore.DocumentReference<CurationMetadata>;
      const collectionRef = stakerContractMetadataRef?.parent?.parent;
      if (stakerContractMetadataRef && collectionRef && !updates.has(stakerContractMetadataRef.path)) {
        await triggerCurationAggregation(ref, batchHandler);
      }
    }
    await batchHandler.flush();
  });

export const triggerCurationMetadataAggregation = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const db = getDb();
    const tenMin = 10 * 60 * 1000;

    const currentSnippetsToAggregate = db
      .collectionGroup(firestoreConstants.COLLECTION_CURATION_COLL)
      .where('currentSnippetRequiresAggregation', '==', true)
      .where('updatedAt', '<', Date.now() - tenMin) as FirebaseFirestore.Query<CurationMetadata>;

    const periodsToAggregate = db
      .collectionGroup(firestoreConstants.COLLECTION_CURATION_COLL)
      .where('periodsRequireAggregation', '==', true)
      .where('updatedAt', '<', Date.now() - tenMin) as FirebaseFirestore.Query<CurationMetadata>;

    const currentSnippetsToRefresh = db
      .collectionGroup(firestoreConstants.COLLECTION_CURATION_COLL)
      .where('refreshCurrentSnippetBy', '<=', Date.now()) as FirebaseFirestore.Query<CurationMetadata>;

    const currentSnippetsToAggregateStream = streamQueryWithRef(currentSnippetsToAggregate, (item, ref) => [ref], {
      pageSize: 300
    });
    const periodsToAggregateStream = streamQueryWithRef(periodsToAggregate, (item, ref) => [ref], { pageSize: 300 });
    const currentSnippetsToRefreshStream = streamQueryWithRef(currentSnippetsToRefresh, (item, ref) => [ref], {
      pageSize: 300
    });

    const updates = new Set<string>();
    const batchHandler = new BatchHandler();
    const streamAndTrigger = async (stream: AsyncIterableIterator<{ ref: FirebaseFirestore.DocumentReference }>) => {
      for await (const { ref } of stream) {
        if (!updates.has(ref.path)) {
          updates.add(ref.path);
          batchHandler.add(ref, { updatedAt: Date.now() }, { merge: true });
        }
      }
    };

    await streamAndTrigger(currentSnippetsToAggregateStream);
    await streamAndTrigger(periodsToAggregateStream);
    await streamAndTrigger(currentSnippetsToRefreshStream);
  });

export const aggregateCurationLedger = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_CURATION_COLL}/{stakingContractId}`
  )
  .onWrite(async (change) => {
    const stakerContractMetadata = change.after.data() as CurationMetadata | undefined;
    if (!stakerContractMetadata) {
      return;
    }
    await handlerStakerContractMetadata(
      change.after.ref as FirebaseFirestore.DocumentReference<CurationMetadata>,
      stakerContractMetadata
    );
  });
