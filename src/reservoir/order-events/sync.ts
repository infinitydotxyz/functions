import { DocRef } from '../../firestore/types';
import { config } from '../../utils/config';
import * as Reservoir from '../../reservoir';
import { FirestoreOrderEvent, SyncMetadata } from './types';
import { getOrderEventRef } from './utils';

export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
  maxPages = 100
) {
  if (initialSync?.data?.metadata?.isPaused) {
    throw new Error('Sync paused');
  }

  let hasNextPage = true;
  let continuation = initialSync.data.data.continuation;
  let pageNumber = 0;
  const pageSize = 300;
  const client = Reservoir.Api.getClient(initialSync.data.metadata.chainId, config.reservoirApiKey);
  const expectedOrderSide = initialSync.data.metadata.type;
  const method =
    expectedOrderSide === 'bid' ? Reservoir.Api.Events.BidEvents.getEvents : Reservoir.Api.Events.AskEvents.getEvents;

  while (hasNextPage && (pageNumber += 1) <= maxPages) {
    const page = await method(client, {
      continuation: continuation || undefined,
      limit: pageSize,
      sortDirection: 'asc'
    });
    const numItems = (page.data?.events ?? []).length;
    const events = page.data.events;

    const { eventsSaved } = await db.runTransaction(async (txn) => {
      const snap = await txn.get(initialSync.ref);
      const currentSync = snap.data() as SyncMetadata;
      let eventsSaved = 0;

      if (currentSync.data.continuation !== continuation) {
        throw new Error('Continuation changed');
      } else if (currentSync.metadata.isPaused) {
        throw new Error('Sync paused');
      }

      const eventsWithRefs = events.map((item) => {
        const event = item.event;
        const id = event.id;
        const order = 'bid' in item ? item.bid : item.order;
        const orderId = order.id;

        const eventRef = getOrderEventRef(db, orderId, id);
        return {
          ...item,
          isSellOrder: !('bid' in item),
          order,
          eventRef
        };
      });

      const eventSnaps = await txn.getAll(...eventsWithRefs.map((item) => item.eventRef));

      for (let i = 0; i < eventsWithRefs.length; i += 1) {
        const item = eventsWithRefs[i];
        const snap = eventSnaps[i];

        if (!item || !snap) {
          throw new Error('Event or snap');
        } else if (item.event.id.toString() !== snap.ref.id) {
          throw new Error('Event id mismatch');
        }

        /**
         * only save events once
         */
        if (!snap.exists) {
          const data: FirestoreOrderEvent = {
            metadata: {
              id: item.event.id.toString(),
              isSellOrder: item.isSellOrder,
              updatedAt: Date.now(),
              migrationId: 1,
              processed: false,
              orderId: item.order.id,
              status: item.order.status
            },
            data: {
              event: item.event,
              order: item.order
            }
          };
          txn.create(item.eventRef, data);
          eventsSaved += 1;
        }
      }

      hasNextPage = page.data.continuation !== continuation && numItems < pageSize && !!page.data.continuation;
      continuation = page.data.continuation ?? '';

      /**
       * update sync metadata
       */
      const update: Partial<SyncMetadata> = {
        data: {
          eventsProcessed: currentSync.data.eventsProcessed + eventsSaved,
          continuation
        }
      };
      txn.set(initialSync.ref, update, { merge: true });

      return {
        eventsSaved
      };
    });

    yield {
      continuation,
      pageNumber,
      pageSize,
      eventsSaved
    };
  }
}
