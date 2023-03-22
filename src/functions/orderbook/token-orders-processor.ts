import {
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  OBOrderStatus,
  OrderDirection
} from '@infinityxyz/lib/types/core';
import {
  FirestoreOrderItemDto,
  NftDto,
  OrderItemSnippetDto,
  OrderStatus,
  OrdersSnippetDto
} from '@infinityxyz/lib/types/dto';

import { FirestoreBatchEventProcessor } from '@/firestore/event-processors/firestore-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';

export class TokenOrdersProcessor extends FirestoreBatchEventProcessor<FirestoreDisplayOrder> {
  protected _isEventProcessed(event: FirestoreDisplayOrder): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents(
    ref: CollRef<FirestoreDisplayOrder> | CollGroupRef<FirestoreDisplayOrder>
  ): Query<FirestoreDisplayOrder> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<FirestoreDisplayOrder>,
    timestamp: number
  ): {
    query: Query<FirestoreDisplayOrder>;
    getStartAfterField: (
      item: FirestoreDisplayOrder,
      ref: FirebaseFirestore.DocumentReference<FirestoreDisplayOrder>
    ) => (string | number | FirebaseFirestore.DocumentReference<FirestoreDisplayOrder>)[];
  } {
    const q = query
      .where('metadata.updatedAt', '<', timestamp)
      .orderBy('metadata.updatedAt', 'asc')
      .orderBy('metadata.id', 'asc');

    const getStartAfterField = (item: FirestoreDisplayOrder) => {
      return [item.metadata.updatedAt, item.metadata.id];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    events: QuerySnap<FirestoreDisplayOrder>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<FirestoreDisplayOrder>
  ): Promise<void> {
    const bestListingQuery = eventsRef
      .where('order.status', '==', OrderStatus.Active)
      .where('metadata.hasError', '==', false)
      .where('order.isSellOrder', '==', true)
      .orderBy('order.startPriceEth', OrderDirection.Ascending)
      .limit(1);

    const bestOfferQuery = eventsRef
      .where('order.status', '==', OrderStatus.Active)
      .where('metadata.hasError', '==', false)
      .where('order.isSellOrder', '==', false)
      .orderBy('order.startPriceEth', OrderDirection.Descending)
      .limit(1);

    const [bestListingSnap, bestOfferSnap] = await Promise.all([txn.get(bestListingQuery), txn.get(bestOfferQuery)]);
    const tokenRef = eventsRef.parent as DocRef<NftDto>;
    const bestListing = bestListingSnap.docs[0]?.data?.();
    const bestOffer = bestOfferSnap.docs[0]?.data?.();

    const tokenId = tokenRef.id;

    const [chainId, collection] = tokenRef.parent.parent?.id?.split?.(':') ?? [];
    if (!chainId || !collection) {
      throw new Error(`Failed to detect token for ${eventsRef.path}`);
    }

    const offerSnippet: OrderItemSnippetDto = {
      hasOrder: !!bestOffer,
      orderItemId: bestOffer?.metadata.id || (null as any),
      orderItem: bestOffer
        ? this.getOrderItem(bestOffer as FirestoreDisplayOrderWithoutError, collection, tokenId)
        : null
    };

    const listingSnippet: OrderItemSnippetDto = {
      hasOrder: !!bestListing,
      orderItemId: bestListing?.metadata.id || (null as any),
      orderItem: bestListing
        ? this.getOrderItem(bestListing as FirestoreDisplayOrderWithoutError, collection, tokenId)
        : null
    };

    const orderSnippet: OrdersSnippetDto = {
      listing: listingSnippet,
      offer: offerSnippet
    };

    txn.set(tokenRef, { ordersSnippet: orderSnippet }, { merge: true });

    for (const eventSnap of events.docs) {
      const data = eventSnap.data();
      const metadata = data?.metadata ?? {};

      if (metadata) {
        const updatedMetadata = {
          ...metadata,
          updatedAt: Date.now(),
          processed: true
        };
        txn.set(eventSnap.ref, { metadata: updatedMetadata } as any, { merge: true });
      }
    }
  }

  protected getOrderItem(
    item: FirestoreDisplayOrderWithoutError,
    tokenAddress: string,
    tokenId: string
  ): FirestoreOrderItemDto {
    const collection =
      item.displayOrder.kind === 'single-collection'
        ? item.displayOrder.item
        : item.displayOrder.items.find((item) => item.address === tokenAddress);
    let token;
    if (collection?.kind === 'single-token') {
      token = collection.token;
    } else if (collection?.kind === 'token-list') {
      token = collection.tokens.find((token) => token.tokenId === tokenId);
    }

    if (!collection || !token) {
      throw new Error(`Collection or token not found for item ${tokenAddress}:${tokenId}`);
    }

    const getStatus: Record<OrderStatus, OBOrderStatus> = {
      [OrderStatus.Active]: OBOrderStatus.ValidActive,
      [OrderStatus.Inactive]: OBOrderStatus.ValidInactive,
      [OrderStatus.Expired]: OBOrderStatus.Invalid,
      [OrderStatus.Filled]: OBOrderStatus.Invalid,
      [OrderStatus.Cancelled]: OBOrderStatus.Invalid
    };

    return {
      id: item.metadata.id,
      source: item.order.sourceMarketplace,
      gasUsage: item.order.gasUsageString,
      orderStatus: getStatus[item.order.status],
      chainId: item.metadata.chainId,
      isSellOrder: item.order.isSellOrder,
      numItems: item.order.numItems,
      startPriceEth: item.order.startPriceEth,
      endPriceEth: item.order.endPriceEth,
      startTimeMs: item.order.startTimeMs,
      endTimeMs: item.order.endTimeMs,
      makerUsername: item.displayOrder.maker.username,
      makerAddress: item.displayOrder.maker.address,
      takerUsername: item.displayOrder?.taker?.username ?? '',
      takerAddress: item.displayOrder?.taker?.address ?? '',
      collectionAddress: collection.address,
      collectionName: collection.name,
      collectionImage: collection.profileImage,
      tokenId: token.tokenId,
      tokenName: token.name,
      tokenImage: token.image,
      numTokens: 1,
      currencyAddress: item.order.currency,
      collectionSlug: collection.slug,
      hasBlueCheck: collection.hasBlueCheck,
      tokenSlug: token.name,
      complicationAddress: item.order.complication,
      attributes: []
    };
  }
}
