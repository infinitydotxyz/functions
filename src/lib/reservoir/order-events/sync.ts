import { sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { DocRef } from '@/firestore/types';
import { bn } from '@/lib/utils';

import { Reservoir } from '../..';
import { AskV2Order, BidV1Order, ReservoirEventMetadata } from '../api/events/types';
import { ReservoirOrderEvent, SyncMetadata } from './types';
import { getReservoirOrderEventId, getReservoirOrderEventRef } from './utils';

/**
 * Efficiently sync a large number of events from the Reservoir API
 *
 * - Maintains the sync state in a firestore document
 *   - This allows us to resume syncing from the last known state
 *   - It is also safe to re-process events - duplicates will be skipped
 * - Pulls events from the Reservoir API
 * - Saves events to the reservoir order events collection in firestore
 * and does a minimal amount of transformation in order to maximize
 * throughput
 */
export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
  pageSize = 300,
  startTimestamp?: number
) {
  if (initialSync?.data?.metadata?.isPaused) {
    throw new Error('Sync paused');
  }

  let hasNextPage = true;
  let pageNumber = 0;
  const client = Reservoir.Api.getClient(initialSync.data.metadata.chainId, config.reservoir.apiKey);

  let method: typeof Reservoir.Api.Events.AskEvents.getEvents | typeof Reservoir.Api.Events.BidEvents.getEvents;
  switch (initialSync.data.metadata.type) {
    case 'ask':
    case 'collection-ask':
      method = Reservoir.Api.Events.AskEvents.getEvents;
      break;
    case 'bid':
    case 'collection-bid':
      method = Reservoir.Api.Events.BidEvents.getEvents;
      break;
  }

  const minTimestampSeconds = initialSync.data.data.minTimestampMs
    ? Math.floor(initialSync.data.data.minTimestampMs / 1000)
    : 0;
  const minTimestamp = startTimestamp ?? minTimestampSeconds;
  const contract = initialSync.data.metadata.collection ? { contract: initialSync.data.metadata.collection } : {};
  while (true) {
    try {
      const { numEventsSaved, continuation, numItems, numItemsAfterFiltering } = await db.runTransaction(
        async (txn) => {
          const snap = await txn.get(initialSync.ref);
          const currentSync = snap.data() as SyncMetadata;

          if (currentSync.metadata.isPaused) {
            throw new Error('Sync paused');
          }

          const page = await method(client, {
            continuation: currentSync.data.continuation,
            limit: pageSize,
            sortDirection: 'asc',
            ...contract,
            startTimestamp: minTimestamp
          });
          const numItems = (page.data?.events ?? []).length;
          const events = (page.data.events as { event: ReservoirEventMetadata }[]).filter((item) => {
            return item.event.kind !== 'reprice';
          }) as
            | { bid: BidV1Order; event: ReservoirEventMetadata }[]
            | { order: AskV2Order; event: ReservoirEventMetadata }[];
          const numItemsAfterFiltering = events.length;

          let numEventsSaved = 0;

          if (page.data.continuation === currentSync.data.continuation) {
            /**
             * continuation did not change
             * skip attempting to read events from firestore
             */
            return { numEventsSaved: 0, continuation: page.data.continuation, numItems, numItemsAfterFiltering };
          }

          const eventsWithRefs = events.map((item) => {
            const event = item.event;
            const id = event.id;
            const order = 'bid' in item ? item.bid : item.order;
            const orderId = order.id;

            const eventRef = getReservoirOrderEventRef(db, orderId, id);
            return {
              ...item,
              isSellOrder: !('bid' in item),
              order,
              eventRef,
              hasNextPage
            };
          });

          const eventSnaps =
            eventsWithRefs.length > 0 ? await txn.getAll(...eventsWithRefs.map((item) => item.eventRef)) : [];

          for (let i = 0; i < eventsWithRefs.length; i += 1) {
            const item = eventsWithRefs[i];
            const snap = eventSnaps[i];

            if (!item || !snap) {
              throw new Error('Event or snap');
            } else if (!bn(item.event.id.toString()).eq(snap.ref.id)) {
              throw new Error('Event id mismatch');
            }

            /**
             * only save events once
             */
            if (!snap.exists) {
              const data: ReservoirOrderEvent = {
                metadata: {
                  id: getReservoirOrderEventId(item.event.id),
                  isSellOrder: item.isSellOrder,
                  updatedAt: Date.now(),
                  migrationId: 1,
                  processed: false,
                  orderId: item.order.id,
                  status: item.order.status,
                  chainId: currentSync.metadata.chainId
                },
                data: {
                  event: item.event,
                  order: item.order
                }
              };
              txn.create(item.eventRef, data);
              numEventsSaved += 1;
            }
          }

          hasNextPage = numItems < pageSize || !!page.data.continuation;

          pageNumber += 1;

          const updatedContinuation = page.data.continuation || currentSync.data.continuation;
          /**
           * update sync metadata
           */
          const update: Partial<SyncMetadata> = {
            data: {
              eventsProcessed: currentSync.data.eventsProcessed + numEventsSaved,
              minTimestampMs: currentSync.data.minTimestampMs ?? 0,
              continuation: updatedContinuation
            }
          };
          txn.set(initialSync.ref, update, { merge: true });

          return {
            continuation: updatedContinuation,
            numEventsSaved,
            numItems,
            numItemsAfterFiltering
          };
        }
      );

      yield {
        continuation,
        pageNumber,
        pageSize,
        numEventsSaved,
        numEventsFound: numItems,
        numEventsFiltered: numItems - numItemsAfterFiltering
      };
    } catch (err) {
      console.error(err);
      await sleep(10_000);
    }
  }
}
