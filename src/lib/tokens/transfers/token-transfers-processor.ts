import { FieldPath } from 'firebase-admin/firestore';

import { EtherscanLinkType, EventType, OrderDirection, TokenStandard } from '@infinityxyz/lib/types/core';
import { NftTransferEvent as FeedNftTransferEvent } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto, UserDisplayDataDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getEtherscanLink } from '@infinityxyz/lib/utils';

import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';

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

      if (!mostRecentValidTransfer || !mostRecentValidTransfer.data) {
        throw new Error('No valid transfer found');
      }
    }

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

    const [collectionSnap, tokenSnap] = await eventsRef.firestore.getAll(collectionRef, tokenRef);
    const token = tokenSnap.data() ?? ({} as Partial<NftDto>);
    const collection = collectionSnap.data() ?? ({} as Partial<CollectionDto>);

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
      const feedEvent = this._getFeedTransferEvent(
        item.data,
        {
          address: item.data.data.from,
          username: '',
          profileImage: '',
          bannerImage: '',
          displayName: ''
        },
        {
          address: item.data.data.to,
          username: '',
          profileImage: '',
          bannerImage: '',
          displayName: ''
        },
        token,
        collection
      );

      const feedEventRef = eventsRef.firestore
        .collection(firestoreConstants.FEED_COLL)
        .doc(`${item.data.data.transactionHash}:${item.data.data.transactionIndex}`) as DocRef<FeedNftTransferEvent>;

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

      txn.set(feedEventRef, feedEvent, { merge: true });
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

      const feedEventRef = eventsRef.firestore
        .collection(firestoreConstants.FEED_COLL)
        .doc(`${item.data.data.transactionHash}:${item.data.data.transactionIndex}`) as DocRef<FeedNftTransferEvent>;

      txn.delete(feedEventRef);
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

  protected _getFeedTransferEvent(
    event: NftTransferEvent,
    from: UserDisplayDataDto,
    to: UserDisplayDataDto,
    token: Partial<NftDto>,
    collection: Partial<CollectionDto>
  ): FeedNftTransferEvent {
    const feedEvent: FeedNftTransferEvent = {
      type: EventType.NftTransfer,
      from: event.data.from,
      to: event.data.to,
      fromDisplayName: from.displayName,
      toDisplayName: to.displayName,
      tokenStandard: TokenStandard.ERC721,
      txHash: event.data.transactionHash,
      quantity: 1,
      externalUrl: getEtherscanLink({
        type: EtherscanLinkType.Transaction,
        transactionHash: event.data.transactionHash
      }),
      likes: 0,
      comments: 0,
      timestamp: 0,
      chainId: event.metadata.chainId,
      collectionAddress: event.metadata.address,
      collectionName: collection.metadata?.name ?? '',
      collectionSlug: collection.slug ?? '',
      collectionProfileImage: collection.metadata?.profileImage ?? collection.metadata?.bannerImage ?? '',
      hasBlueCheck: token.hasBlueCheck ?? false,
      internalUrl: '',
      tokenId: event.metadata.tokenId,
      image: token.image?.url ?? token.image?.originalUrl ?? token.alchemyCachedImage ?? '',
      nftName: token.metadata?.name ?? '',
      nftSlug: token.slug ?? ''
    };
    return feedEvent;
  }
}
