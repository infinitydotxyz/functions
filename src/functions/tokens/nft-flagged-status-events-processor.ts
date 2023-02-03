import { FieldPath } from 'firebase-admin/firestore';

import { OrderDirection } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { FlaggedTokenEvent } from '@/lib/reservoir/api/tokens/types';

export interface NftFlaggedStatusEvent {
  data: FlaggedTokenEvent;
  metadata: {
    timestamp: number;
    updatedAt: number;
    processed: boolean;
  };
}

export class NftFlaggedStatusEventsProcessor extends FirestoreInOrderBatchEventProcessor<NftFlaggedStatusEvent> {
  protected _applyOrderBy<Events extends { metadata: { timestamp: number } } = NftFlaggedStatusEvent>(
    query: CollRef<Events> | Query<Events>,
    direction: OrderDirection
  ): {
    query: Query<Events>;
    getStartAfterField: (
      item: Events,
      ref: FirebaseFirestore.DocumentReference<Events>
    ) => (string | number | FirebaseFirestore.DocumentReference<Events>)[];
  } {
    const q = query.orderBy('metadata.timestamp', direction).orderBy(FieldPath.documentId(), direction);

    return {
      query: q,
      getStartAfterField: (item, ref) => [item.metadata.timestamp, ref]
    };
  }

  protected _applyOrderByLessThan<Events extends { metadata: { timestamp: number } } = NftFlaggedStatusEvent>(
    query: CollRef<Events> | Query<Events>,
    timestamp: number
  ): Query<Events> {
    return query.where('metadata.timestamp', '<', timestamp);
  }

  protected _isEventProcessed(event: NftFlaggedStatusEvent): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = NftFlaggedStatusEvent>(
    ref: CollRef<Event> | CollGroupRef<Event>
  ): Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<NftFlaggedStatusEvent>,
    timestamp: number
  ): {
    query: Query<NftFlaggedStatusEvent>;
    getStartAfterField: (
      item: NftFlaggedStatusEvent,
      ref: DocRef<NftFlaggedStatusEvent>
    ) => (string | number | DocRef<NftFlaggedStatusEvent>)[];
  } {
    const q = query
      .where('metadata.updatedAt', '<', timestamp)
      .orderBy('metadata.updatedAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');

    const getStartAfterField = (item: NftFlaggedStatusEvent, ref: DocRef<NftFlaggedStatusEvent>) => {
      return [item.metadata.updatedAt, ref];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    events: QuerySnap<NftFlaggedStatusEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<NftFlaggedStatusEvent>
  ) {
    const items = events.docs.map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    let mostRecentEvent:
      | {
          data: NftFlaggedStatusEvent;
          ref: DocRef<NftFlaggedStatusEvent>;
        }
      | undefined = items[items.length - 1];

    if (!mostRecentEvent) {
      const mostRecentEventQuery = eventsRef.orderBy('metadata.timestamp', 'desc').limit(1);

      const mostRecentEventsSnap = await txn.get(mostRecentEventQuery);
      const mostRecentEvents = mostRecentEventsSnap.docs.map((item) => {
        return {
          data: item.data(),
          ref: item.ref
        };
      });

      mostRecentEvent = mostRecentEvents?.[0];
    }

    if (mostRecentEvent) {
      const chainId = mostRecentEvent.data.data.chainId;
      const tokenId = mostRecentEvent.data.data.tokenId;
      const address = mostRecentEvent.data.data.collectionAddress;
      const collectionRef = eventsRef.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${address}`) as DocRef<CollectionDto>;
      const tokenRef = collectionRef.collection(firestoreConstants.COLLECTION_NFTS_COLL).doc(tokenId) as DocRef<NftDto>;

      const tokenUpdate: Partial<NftDto> = {
        isFlagged: mostRecentEvent.data.data.isFlagged
      };

      txn.set(tokenRef, tokenUpdate, { merge: true });
    }

    for (const item of items) {
      const metadataUpdate: NftFlaggedStatusEvent['metadata'] = {
        ...item.data.metadata,
        processed: true,
        updatedAt: Date.now()
      };

      txn.set(
        item.ref,
        {
          metadata: metadataUpdate as any
        },
        { merge: true }
      );
    }
  }
}
