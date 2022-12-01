import { Erc20TokenMetadata } from '@infinityxyz/lib/types/core';
import { ChainId } from '@infinityxyz/lib/types/core/ChainId';
import { CurationLedgerEventType, CurationLedgerEventsWithStake } from '@infinityxyz/lib/types/core/curation-ledger';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { getCollectionDisplayData } from '@/lib/utils';

import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationMetadata } from './types';

export async function aggregateLedger(
  stakerContractCurationMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  collectionAddress: string,
  chainId: ChainId,
  stakerContractAddress: string,
  stakerContractChainId: ChainId,
  token: Erc20TokenMetadata
) {
  const curationLedgerRef = stakerContractCurationMetadataRef.collection(firestoreConstants.CURATION_LEDGER_COLL);
  const snapshot = await curationLedgerRef
    .where('isAggregated', '==', false)
    .where('isStakeMerged', '==', true)
    .where('isDeleted', '==', false)
    .orderBy('blockNumber', 'asc')
    .limit(1)
    .get();
  const firstUnaggregatedDoc = snapshot.docs[0];
  const firstUnaggregatedEvent = firstUnaggregatedDoc?.data() as CurationLedgerEventsWithStake | undefined;
  if (!firstUnaggregatedEvent) {
    console.error(`Failed to find unaggregated event for ${stakerContractCurationMetadataRef.path}`);
    return;
  }

  const curationBlockRange = CurationBlockAggregator.getCurationBlockRange(firstUnaggregatedEvent.timestamp);
  const curationLedgerEventsQuery = curationLedgerRef
    .where('isStakeMerged', '==', true)
    .where('timestamp', '>=', curationBlockRange.startTimestamp)
    .orderBy('timestamp', 'asc') as FirebaseFirestore.Query<CurationLedgerEventsWithStake>;
  const curationLedgerEventsStream = streamQueryWithRef(curationLedgerEventsQuery, (item, ref) => [ref], {
    pageSize: 300
  });

  const events: CurationLedgerEventsWithStake[] = [];
  const eventsWithRefs = [];
  for await (const { data, ref } of curationLedgerEventsStream) {
    events.push({ ...data });
    eventsWithRefs.push({ ...data, ref });
  }

  const collection = await getCollectionDisplayData(curationLedgerRef.firestore, collectionAddress, chainId);
  const curationAggregator = new CurationBlockAggregator(
    events,
    stakerContractCurationMetadataRef,
    collectionAddress,
    chainId,
    stakerContractAddress,
    stakerContractChainId,
    token
  );
  await curationAggregator.aggregate(collection);

  const batchHandler = new BatchHandler();
  for (const event of eventsWithRefs) {
    const updatedEvent: Partial<CurationLedgerEventType> = {
      isAggregated: true,
      updatedAt: Date.now()
    };
    batchHandler.add(event.ref, updatedEvent, { merge: true });
  }
  await batchHandler.flush();
}
