import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { CurationLedgerEventType } from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationMetadata } from './types';

export async function aggregateLedger(
  stakerContractCurationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  chainId: ChainId,
  stakerContractAddress: string,
  stakerContractChainId: ChainId
) {
  const curationLedgerRef = stakerContractCurationMetadataRef.collection(firestoreConstants.CURATION_LEDGER_COLL);
  const snapshot = await curationLedgerRef
    .where('isAggregated', '==', false)
    .where('isDeleted', '==', false)
    .orderBy('blockNumber', 'asc')
    .limit(1)
    .get();
  const firstUnaggregatedDoc = snapshot.docs[0];
  const firstUnaggregatedEvent = firstUnaggregatedDoc?.data() as CurationLedgerEventType | undefined;
  if (!firstUnaggregatedEvent) {
    console.error(`Failed to find unaggregated event for ${stakerContractCurationMetadataRef.path}`);
    return;
  }

  const curationBlockRange = CurationBlockAggregator.getCurationBlockRange(firstUnaggregatedEvent.timestamp);
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

  const curationAggregator = new CurationBlockAggregator(
    events,
    stakerContractCurationMetadataRef,
    collectionAddress,
    chainId,
    stakerContractAddress,
    stakerContractChainId
  );
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
