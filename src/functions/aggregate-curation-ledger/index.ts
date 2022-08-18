import { ChainId } from '@infinityxyz/lib/types/core';
import { CurationLedgerEvents, CurationLedgerEventType } from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants, ONE_MIN } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { REGION } from '../../utils/constants';
import { aggregateLedger } from './aggregate-ledger';
import { aggregateBlocks } from './aggregate-periods';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import { mergeStake } from './merge-stake';
import { CurationMetadata } from './types';
import {
  getCurrentBlocks,
  getCurrentCurationSnippet,
  getCurrentPeriods,
  saveCurrentCurationSnippet
} from './update-current-curation-snippet';

export const onCurationLedgerEvent = functions
  .region(REGION)
  .firestore.document(
    `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_CURATION_COLL}/{stakerContractId}/${firestoreConstants.CURATION_LEDGER_COLL}`
  )
  .onWrite(async (change) => {
    const curationLedgerEvent = change.after.data() as CurationLedgerEvents;
    if (curationLedgerEvent.isStakeMerged === false) {
      await mergeStake(change.after.ref as FirebaseFirestore.DocumentReference<CurationLedgerEvents>);
    }
  });

export const triggerCurationLedgerEventMerge = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('0,10,20,30,40,50 * * * *')
  .onRun(async () => {
    const db = getDb();
    const fifteenMin = ONE_MIN * 15;
    const curationEventsToAggregate = db
      .collectionGroup(firestoreConstants.CURATION_LEDGER_COLL)
      .where('isStakeMerged', '==', false)
      .where('isDeleted', '==', false)
      .where('updatedAt', '<', Date.now() - fifteenMin) as FirebaseFirestore.Query<CurationLedgerEventType>;

    const stream = streamQueryWithRef(curationEventsToAggregate, (item, ref) => [ref], { pageSize: 300 });

    const batch = new FirestoreBatchHandler();
    for await (const item of stream) {
      const triggerUpdate: Partial<CurationLedgerEventType> = {
        updatedAt: Date.now()
      };
      batch.add(item.ref, triggerUpdate, { merge: true });
    }
  });

// TODO update staker contract metadata to have token contract address and chain ID
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
      .where('isStakeMerged', '==', true)
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

export const triggerCurationMetadataAggregation = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('5,15,25,35,45,55 * * * *')
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
    const batchHandler = new FirestoreBatchHandler();
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
        stakerContractChainId,
        stakerContractMetadata.tokenContractAddress,
        stakerContractMetadata.tokenContractChainId
      );
      const triggerPeriodAggregationUpdate: Partial<CurationMetadata> = {
        ledgerRequiresAggregation: false,
        updatedAt: Date.now(),
        periodsRequireAggregation: true,
        collectionAddress,
        collectionChainId,
        stakerContractAddress,
        stakerContractChainId,
        tokenContractAddress: stakerContractMetadata.tokenContractAddress,
        tokenContractChainId: stakerContractMetadata.tokenContractChainId
      };
      await stakerContractMetadataRef.set(triggerPeriodAggregationUpdate, { merge: true });
    } else if (stakerContractMetadata.periodsRequireAggregation) {
      await aggregateBlocks(
        stakerContractMetadataRef,
        collectionAddress,
        collectionChainId,
        stakerContractAddress,
        stakerContractChainId,
        stakerContractMetadata.tokenContractAddress,
        stakerContractMetadata.tokenContractChainId
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
        stakerContractChainId,
        stakerContractMetadata.tokenContractAddress,
        stakerContractMetadata.tokenContractChainId
      );
      const currentBlockExpiresAt = currentBlocks.current?.timestamp
        ? CurationBlockAggregator.getCurationBlockRange(currentBlocks.current?.timestamp).endTimestamp
        : null;
      const currentPeriodExpiresAt = currentPeriods.current?.timestamp
        ? CurationPeriodAggregator.getCurationPeriodRange(currentPeriods.current?.timestamp).endTimestamp
        : null;
      const refreshCurrentSnippetBy =
        currentBlockExpiresAt ?? currentPeriodExpiresAt ?? Date.now() + CurationPeriodAggregator.DURATION;
      await saveCurrentCurationSnippet(currentSnippet, stakerContractMetadataRef);
      const metadataUpdate: Partial<CurationMetadata> = {
        currentSnippetRequiresAggregation: false,
        updatedAt: Date.now(),
        refreshCurrentSnippetBy
      };
      await stakerContractMetadataRef.set(metadataUpdate, { merge: true });
    }
  });
