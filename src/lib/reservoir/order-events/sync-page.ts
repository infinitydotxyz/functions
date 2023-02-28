import { getCollectionDocId } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

import { Reservoir } from '../..';
import { AskEventV3, BidEventV3 } from '../api/events/types';
import { ReservoirClient } from '../api/get-client';
import { ReservoirOrderEvent, SyncMetadata } from './types';
import { getReservoirOrderEventId, getReservoirOrderEventRef } from './utils';

export async function syncPage(
  db: FirebaseFirestore.Firestore,
  client: ReservoirClient,
  pageSize = 300,
  supportedCollections: SupportedCollectionsProvider,
  sync: SyncMetadata
) {
  if (sync.metadata.isPaused) {
    throw new Error('Paused');
  }

  let method: typeof Reservoir.Api.Events.AskEvents.getEvents | typeof Reservoir.Api.Events.BidEvents.getEvents;
  switch (sync.metadata.type) {
    case 'ask':
    case 'collection-ask':
      method = Reservoir.Api.Events.AskEvents.getEvents;
      break;
    case 'bid':
    case 'collection-bid':
      method = Reservoir.Api.Events.BidEvents.getEvents;
      break;
  }

  const minTimestampSeconds = sync.data.minTimestampMs ? Math.floor(sync.data.minTimestampMs / 1000) : 0;
  const contract = sync.metadata.collection ? { contract: sync.metadata.collection } : {};

  const page = await method(client, {
    continuation: sync.data.continuation,
    limit: pageSize,
    sortDirection: 'asc',
    ...contract,
    startTimestamp: minTimestampSeconds
  });

  const numItems = (page.data?.events ?? []).length;

  const events = (page.data.events as (AskEventV3 | BidEventV3)[]).filter((item) => {
    const isReprice = item.event.kind === 'reprice';
    const isBid = 'bid' in item;
    const collAddress = isBid ? item.bid.contract : item.order.contract;

    // check if collection is supported
    const collectionDocId = getCollectionDocId({
      collectionAddress: collAddress,
      chainId: sync.metadata.chainId
    });
    const isSupportedCollection = supportedCollections.has(collectionDocId);

    return !isReprice && isSupportedCollection;
  });

  const numItemsAfterFiltering = events.length;

  if (page.data.continuation === sync.data.continuation) {
    /**
     * continuation did not change
     * skip attempting to read events from firestore
     */
    return { numEventsSaved: 0, continuation: page.data.continuation, numItems, numItemsAfterFiltering, sync };
  }

  let numEventsSaved = 0;

  const batch = new BatchHandler();
  for (const item of events) {
    const event = item.event;
    const id = event.id;
    const isSellOrder = !('bid' in item);
    const order = 'bid' in item ? item.bid : item.order;
    const orderId = order.id;

    const data: ReservoirOrderEvent = {
      metadata: {
        id: getReservoirOrderEventId(id),
        isSellOrder,
        updatedAt: Date.now(),
        migrationId: 1,
        processed: false,
        orderId: order.id,
        status: order.status,
        chainId: sync.metadata.chainId
      },
      data: {
        event: item.event,
        order: order
      }
    };

    const eventRef = getReservoirOrderEventRef(db, orderId, id);
    await batch.addAsync(eventRef, data, { merge: false });
    numEventsSaved += 1;
  }
  await batch.flush();

  const hasNextPage = numItems === pageSize;
  const updatedContinuation = page.data.continuation || sync.data.continuation;

  /**
   * update sync metadata
   */
  const update: Partial<SyncMetadata> = {
    data: {
      eventsProcessed: sync.data.eventsProcessed + numEventsSaved,
      minTimestampMs: sync.data.minTimestampMs ?? 0,
      continuation: updatedContinuation
    }
  };

  return { sync: update, hasNextPage, pageSize, numEventsSaved, numEventsFound: numItems };
}
