import { ethers } from 'ethers';
import { FieldPath } from 'firebase-admin/firestore';

import { OrderDirection } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { enqueueCollection } from '@/lib/indexer';

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
      getStartAfterField: (item, ref) => [item.data.blockTimestamp, ref]
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
      return [item.metadata.timestamp, ref];
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

    this._sortTransfers(items);

    const validTransfers = items.filter((item) => {
      return item.data.data.removed === false;
    });

    const removedTransfers = items.filter((item) => {
      return item.data.data.removed === true;
    });

    let mostRecentValidTransfer:
      | {
          data: NftTransferEvent;
          ref: FirebaseFirestore.DocumentReference<NftTransferEvent>;
        }
      | undefined = validTransfers[validTransfers.length - 1];

    if (!mostRecentValidTransfer) {
      const mostRecentValidTransferQuery = eventsRef
        .where('data.removed', '==', false)
        .orderBy('data.blockTimestamp', 'desc')
        .orderBy('data.transactionIndex', 'desc')
        .limit(10);

      const mostRecentValidTransferSnap = await txn.get(mostRecentValidTransferQuery);
      const mostRecentTransfers = mostRecentValidTransferSnap.docs.map((item) => {
        return {
          data: item.data(),
          ref: item.ref
        };
      });

      this._sortTransfers(mostRecentTransfers);

      mostRecentValidTransfer = mostRecentTransfers?.[0];
    }

    if (mostRecentValidTransfer) {
      /**
       * update the owner of the token
       */
      const ownerAddress = mostRecentValidTransfer.data.data.to;

      const chainId = mostRecentValidTransfer.data.metadata.chainId;
      const tokenId = mostRecentValidTransfer.data.metadata.tokenId;
      const address = mostRecentValidTransfer.data.metadata.address;
      const collectionRef = eventsRef.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${address}`) as DocRef<CollectionDto>;
      const tokenRef = collectionRef.collection(firestoreConstants.COLLECTION_NFTS_COLL).doc(tokenId) as DocRef<NftDto>;

      if (validTransfers.find((item) => item.data.data.from === ethers.constants.AddressZero)) {
        await enqueueCollection({
          chainId,
          address
        })
          .then(() => {
            console.log(`Enqueued collection for indexing ${chainId}:${address}`);
          })
          .catch((err) => {
            console.warn(`Failed to enqueue collection for indexing: ${err}`);
          });
      }

      const tokenUpdate: Partial<NftDto> = {
        ownerData: {
          address: ownerAddress,
          username: '',
          profileImage: '',
          bannerImage: '',
          displayName: ''
        },
        owner: ownerAddress
      };

      txn.set(tokenRef, tokenUpdate, { merge: true });
      for (const item of validTransfers) {
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

    for (const item of removedTransfers) {
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

  protected _sortTransfers(
    transfers: { data: NftTransferEvent; ref: FirebaseFirestore.DocumentReference<NftTransferEvent> }[]
  ) {
    transfers.sort((a, b) => {
      if (a.data.data.blockNumber < b.data.data.blockNumber) {
        return -1;
      } else if (a.data.data.blockNumber > b.data.data.blockNumber) {
        return 1;
      }

      if (a.data.data.transactionIndex < b.data.data.transactionIndex) {
        return -1;
      } else if (a.data.data.transactionIndex > b.data.data.transactionIndex) {
        return 1;
      }

      if (a.data.data.logIndex < b.data.data.logIndex) {
        return -1;
      } else if (a.data.data.logIndex > b.data.data.logIndex) {
        return 1;
      }

      return 0;
    });
  }
}
