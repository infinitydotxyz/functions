import { FieldPath } from 'firebase-admin/firestore';
import PQueue from 'p-queue';

import {
  EtherscanLinkType,
  EventType,
  FirestoreDisplayOrder,
  OrderDirection,
  OrderEventKind,
  OrderEvents,
  OrderTokenOwnerUpdate,
  TokenStandard,
  UserDisplayData
} from '@infinityxyz/lib/types/core';
import { NftTransferEvent as FeedNftTransferEvent } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto, UserDisplayDataDto, UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getEtherscanLink } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getUserDisplayData } from '@/lib/utils';
import { getErc721Owner } from '@/lib/utils/ethersUtils';

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

    const removedTransfers = items.filter((item) => {
      return item.data.data.removed === true;
    });

    const mostRecentValidTransfer = validTransfers[validTransfers.length - 1];

    if (mostRecentValidTransfer) {
      /**
       * update the owner of the token
       */
      const ownerAddress = mostRecentValidTransfer.data.data.to;
      const ownerRef = eventsRef.firestore
        .collection(firestoreConstants.USERS_COLL)
        .doc(ownerAddress) as DocRef<UserProfileDto>;
      const user = await getUserDisplayData(ownerRef);

      const chainId = mostRecentValidTransfer?.data?.metadata?.chainId;
      const tokenId = mostRecentValidTransfer?.data?.metadata?.tokenId;
      const address = mostRecentValidTransfer?.data?.metadata?.address;
      const collectionRef = eventsRef.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${address}`) as DocRef<CollectionDto>;
      const tokenRef = collectionRef.collection(firestoreConstants.COLLECTION_NFTS_COLL).doc(tokenId) as DocRef<NftDto>;

      const [collectionSnap, tokenSnap] = await eventsRef.firestore.getAll(collectionRef, tokenRef);
      const token = tokenSnap.data() ?? ({} as Partial<NftDto>);
      const collection = collectionSnap.data() ?? ({} as Partial<CollectionDto>);

      const tokenUpdate: Partial<NftDto> = {
        ownerData: user,
        owner: ownerAddress
      };

      await this._updateOrderOwners(mostRecentValidTransfer.data, tokenRef, user, {
        address,
        tokenId
      });
      txn.set(tokenRef, tokenUpdate, { merge: true });
      for (const item of validTransfers) {
        const fromRef = eventsRef.firestore
          .collection(firestoreConstants.USERS_COLL)
          .doc(item.data.data.from) as DocRef<UserProfileDto>;
        const toRef = eventsRef.firestore
          .collection(firestoreConstants.USERS_COLL)
          .doc(item.data.data.to) as DocRef<UserProfileDto>;
        const [from, to] = await Promise.all([getUserDisplayData(fromRef), getUserDisplayData(toRef)]);
        const feedEvent = this._getFeedTransferEvent(item.data, from, to, token, collection);

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
    } else if (removedTransfers.length > 0) {
      const firstRemovedEvent = removedTransfers[0];
      if (firstRemovedEvent) {
        const address = firstRemovedEvent.data.metadata.address;
        const tokenId = firstRemovedEvent.data.metadata.tokenId;
        const chainId = firstRemovedEvent.data.metadata.chainId;
        const collectionRef = eventsRef.firestore
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(`${chainId}:${address}`) as DocRef<CollectionDto>;
        const tokenRef = collectionRef
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(tokenId) as DocRef<NftDto>;
        const owner = await getErc721Owner({ address, tokenId, chainId });
        const ownerData = await getUserDisplayData(
          eventsRef.firestore.collection(firestoreConstants.USERS_COLL).doc(owner) as DocRef<UserProfileDto>
        );

        await this._updateOrderOwners(firstRemovedEvent.data, tokenRef, ownerData, {
          address,
          tokenId
        });

        const tokenUpdate: Partial<NftDto> = {
          ownerData: ownerData,
          owner
        };
        txn.set(tokenRef, tokenUpdate, { merge: true });
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

      const feedEventRef = eventsRef.firestore
        .collection(firestoreConstants.FEED_COLL)
        .doc(`${item.data.data.transactionHash}:${item.data.data.transactionIndex}`) as DocRef<FeedNftTransferEvent>;

      txn.delete(feedEventRef);
    }
  }

  protected async _updateOrderOwners(
    event: NftTransferEvent,
    tokenRef: DocRef<NftDto>,
    owner: UserDisplayData,
    token: { address: string; tokenId: string }
  ) {
    const validOrders = tokenRef
      .collection('tokenV2Orders')
      .where('order.isValid', '==', true) as CollRef<FirestoreDisplayOrder>;

    const stream = streamQueryWithRef(validOrders);

    const queue = new PQueue({ concurrency: 25 });

    const batchHandler = new BatchHandler();
    let error: Error | undefined;
    for await (const { ref } of stream) {
      queue
        .add(async () => {
          const id = ref.id;
          const orderEvents = tokenRef.firestore
            .collection('ordersV2')
            .doc(id)
            .collection(firestoreConstants.ORDER_EVENTS_COLL) as CollRef<OrderEvents>;
          const mostRecentEventsSnaps = await orderEvents
            .orderBy('metadata.timestamp', 'desc')
            .startAfter(event.metadata.timestamp)
            .limit(1)
            .get();

          const mostRecentEventSnap = mostRecentEventsSnaps?.docs?.[0];
          const mostRecentEvent = mostRecentEventSnap?.data?.();
          if (mostRecentEvent) {
            const eventRef = orderEvents.doc();
            const orderEvent: OrderTokenOwnerUpdate = {
              metadata: {
                ...mostRecentEvent.metadata,
                id: eventRef.id,
                eventSource: 'infinity-orderbook',
                eventKind: OrderEventKind.TokenOwnerUpdate,
                processed: false,
                updatedAt: Date.now()
              },
              data: {
                status: mostRecentEvent.data.status,
                owner,
                token
              }
            };

            await batchHandler.addAsync(eventRef, orderEvent, { merge: true });
          }
        })
        .catch((err) => {
          error = err;
          console.error(`Failed to update order owners ${err}`);
        });
    }

    await batchHandler.flush();
    await queue.onIdle();
    if (error) {
      throw error;
    }
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
