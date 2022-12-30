import { FieldPath } from 'firebase-admin/firestore';

import { OrderDirection } from '@infinityxyz/lib/types/core';
import { NftDto, UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getUserDisplayData } from '@/lib/utils';

import { NftTransferEvent } from './types';

export class TokenTransfersProcessor extends FirestoreInOrderBatchEventProcessor<NftTransferEvent> {
  protected _applyOrderBy<Events extends { data: { blockTimestamp: number } } = NftTransferEvent>(
    query: CollRef<Events> | Query<Events>,
    direction: OrderDirection
  ): {
    query: Query<Events>;
    getStartAfterField: (
      item: Events,
      ref: FirebaseFirestore.DocumentReference<Events>
    ) => (string | number | FirebaseFirestore.DocumentReference<Events>)[];
  } {
    const q = query.orderBy('data.blockTimestamp', direction).orderBy(FieldPath.documentId(), direction);

    return {
      query: q,
      getStartAfterField: (item, ref) => [item.data.blockTimestamp, ref.id]
    };
  }

  protected _applyOrderByLessThan<Events extends { data: { blockTimestamp: number } } = NftTransferEvent>(
    query: CollRef<Events> | Query<Events>,
    timestamp: number
  ): Query<Events> {
    const timestampInSeconds = Math.floor(timestamp / 1000);
    return query.where('data.blockTimestamp', '<', timestampInSeconds);
  }

  protected _isEventProcessed(event: NftTransferEvent): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = NftTransferEvent>(
    ref: CollRef<Event> | CollGroupRef<Event>
  ): Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<NftTransferEvent>,
    timestamp: number
  ): {
    query: Query<NftTransferEvent>;
    getStartAfterField: (
      item: NftTransferEvent,
      ref: DocRef<NftTransferEvent>
    ) => (string | number | DocRef<NftTransferEvent>)[];
  } {
    const q = query
      .where('metadata.timestamp', '<', timestamp)
      .orderBy('metadata.timestamp', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');

    const getStartAfterField = (item: NftTransferEvent, ref: DocRef<NftTransferEvent>) => {
      return [item.metadata.timestamp, ref.id];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    events: QuerySnap<NftTransferEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<NftTransferEvent>
  ) {
    const items = events.docs.map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    const validTransfers = items.filter((item) => {
      return item.data.data.removed === false;
    });

    const mostRecentValidTransfer = validTransfers[validTransfers.length - 1];

    if (mostRecentValidTransfer) {
      const ownerAddress = mostRecentValidTransfer.data.data.to;

      const ownerRef = eventsRef.firestore
        .collection(firestoreConstants.USERS_COLL)
        .doc(ownerAddress) as DocRef<UserProfileDto>;

      const user = await getUserDisplayData(ownerRef);

      const tokenUpdate: Partial<NftDto> = {
        ownerData: user,
        owner: ownerAddress
      };

      const tokenRef = eventsRef.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${mostRecentValidTransfer.data.metadata.chainId}:${mostRecentValidTransfer.data.metadata.address}`)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(mostRecentValidTransfer.data.metadata.tokenId) as DocRef<NftDto>;

      txn.set(tokenRef, tokenUpdate, { merge: true });
    }

    for (const item of items) {
      const metadataUpdate: NftTransferEvent['metadata'] = {
        ...item.data.metadata,
        processed: true,
        timestamp: Date.now()
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
