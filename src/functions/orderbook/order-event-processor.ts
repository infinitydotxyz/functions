import { ethers } from 'ethers';
import { nanoid } from 'nanoid';

import {
  InfinityLinkType,
  ChainId,
  EventType,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  NftListingEvent,
  NftOfferEvent,
  OrderBookEvent,
  OrderCreatedEvent,
  OrderDirection,
  OrderEventKind,
  OrderEventMetadata,
  OrderEvents,
  OrderStatusEvent,
  OrderTokenOwnerUpdate,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, getInfinityLink } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, DocSnap, Firestore, Query, QuerySnap } from '@/firestore/types';
import { Orderbook } from '@/lib/index';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { OrderUpdater } from '@/lib/orderbook/order/order-updater';
import { getProvider } from '@/lib/utils/ethersUtils';

import { saveOrderToPG } from './save-order-to-pg';

export class OrderEventProcessor extends FirestoreInOrderBatchEventProcessor<OrderEvents> {
  protected _applyOrderBy<Events extends { metadata: { timestamp: number; id: string } } = OrderEvents>(
    query: CollRef<Events> | Query<Events>,
    direction: OrderDirection = OrderDirection.Ascending
  ): {
    query: Query<Events>;
    getStartAfterField: (
      item: Events,
      ref: FirebaseFirestore.DocumentReference<Events>
    ) => (string | number | FirebaseFirestore.DocumentReference<Events>)[];
  } {
    const q = query.orderBy('metadata.timestamp', direction).orderBy('metadata.id', direction);

    return {
      query: q,
      getStartAfterField: (item) => [item.metadata.timestamp, item.metadata.id]
    };
  }

  protected _applyOrderByLessThan<Events extends { metadata: { timestamp: number } } = OrderEvents>(
    query: CollRef<Events> | Query<Events>,
    timestamp: number
  ): Query<Events> {
    return query.where('metadata.timestamp', '<', timestamp);
  }

  protected _isEventProcessed(event: OrderEvents): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = OrderEvents>(
    ref: CollRef<Event> | CollGroupRef<Event>
  ): Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<OrderEvents>,
    timestamp: number
  ): {
    query: Query<OrderEvents>;
    getStartAfterField: (
      item: OrderEvents,
      ref: FirebaseFirestore.DocumentReference<OrderEvents>
    ) => (string | number | FirebaseFirestore.DocumentReference<OrderEvents>)[];
  } {
    const q = query
      .where('metadata.updatedAt', '<', timestamp)
      .orderBy('metadata.updatedAt', 'asc')
      .orderBy('metadata.id', 'asc');

    return {
      query: q,
      getStartAfterField: (item) => [item.metadata.updatedAt, item.metadata.orderId]
    };
  }

  protected async _processEvents(
    events: QuerySnap<OrderEvents>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<OrderEvents>
  ) {
    const items = events.docs.map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    const sampleEvent = items[0]?.data?.metadata;
    if (!sampleEvent) {
      throw new Error('No event found');
    }

    const rawOrderRef = eventsRef.parent as DocRef<RawFirestoreOrder>;
    const chainDisplayRef = this.db
      .collection('ordersV2ByChain')
      .doc(sampleEvent.chainId)
      .collection('chainV2Orders')
      .doc(rawOrderRef.id) as DocRef<FirestoreDisplayOrder>;

    const [rawOrderSnap, chainDisplaySnap] = (await txn.getAll<any>(rawOrderRef, chainDisplayRef)) as [
      DocSnap<RawFirestoreOrder>,
      DocSnap<FirestoreDisplayOrder>
    ];

    const orderCreatedEvent = items.find((item) => item.data.metadata.eventKind === OrderEventKind.Created) as
      | { data: OrderCreatedEvent; ref: DocRef<OrderCreatedEvent> }
      | undefined;

    let orderUpdater: OrderUpdater;
    try {
      orderUpdater = await this._getOrder(
        txn,
        sampleEvent.chainId,
        rawOrderSnap,
        chainDisplaySnap,
        orderCreatedEvent?.data
      );
    } catch (err) {
      // mark all events as processed
      for (const item of items) {
        const metadataUpdate: OrderEventMetadata = {
          ...item.data.metadata,
          eventKind: item.data.metadata.eventKind,
          updatedAt: Date.now(),
          processed: true
        };

        txn.set(
          item.ref,
          {
            metadata: metadataUpdate as any
          },
          { merge: true }
        );
      }

      return;
    }

    const provider = getProvider(orderUpdater.rawOrder.metadata.chainId);
    if (!provider) {
      throw new Error('invalid chain id');
    }

    const saves: (() => void)[] = [];

    const initialStatus = orderUpdater.rawOrder.order.status;
    for (const item of items) {
      const { data: event, ref } = item;
      if (
        (orderUpdater.rawOrder.metadata.source === 'flow' && event.metadata.eventSource !== 'reservoir') ||
        orderUpdater.rawOrder.metadata.source !== 'flow'
      ) {
        switch (event.metadata.eventKind) {
          case OrderEventKind.Created:
          case OrderEventKind.BalanceChange:
          case OrderEventKind.ApprovalChange:
          case OrderEventKind.Bootstrap:
          case OrderEventKind.Revalidation:
          case OrderEventKind.PriceUpdate: // future-todo: handle this differently to support dynamic orders
          case OrderEventKind.Cancelled:
          case OrderEventKind.Expired:
          case OrderEventKind.Sale:
            orderUpdater.setStatus(event.data.status);
            break;
          case OrderEventKind.TokenOwnerUpdate:
            orderUpdater.setStatus(event.data.status);
            orderUpdater.setTokenOwner(
              (event as OrderTokenOwnerUpdate).data.owner,
              (event as OrderTokenOwnerUpdate).data.token
            );
            break;
          default:
            throw new Error(`Unknown event kind: ${(event?.metadata as unknown as any)?.eventKind}`);
        }
      }

      const metadataUpdate: OrderEventMetadata = {
        ...event.metadata,
        eventKind: event.metadata.eventKind,
        updatedAt: Date.now(),
        processed: true
      };

      saves.push(() => {
        txn.set(
          ref,
          {
            metadata: metadataUpdate as any
          },
          { merge: true }
        );
      });
    }

    const finalStatus = orderUpdater.rawOrder.order.status;

    //save order
    let order = orderUpdater.rawOrder;
    let displayOrder = orderUpdater.displayOrder;
    const gasSimulator = new Orderbook.Orders.GasSimulator(
      provider,
      config.orderbook.gasSimulationAccount[order.metadata.chainId]
    );
    const db = this._getDb();
    const baseOrder = new BaseOrder(
      order.metadata.id,
      order.metadata.chainId,
      order.order.isSellOrder,
      db,
      provider,
      gasSimulator
    );

    const statusChanged = initialStatus !== finalStatus;
    const updateGasUsage = statusChanged && finalStatus === 'active';
    let gasUpdated = false;
    if (updateGasUsage) {
      const initialGasUsage = order?.order?.gasUsage;
      const gasUsage = await baseOrder.getGasUsage(order);

      orderUpdater.setGasUsage(gasUsage);

      order = orderUpdater.rawOrder;
      displayOrder = orderUpdater.displayOrder;

      gasUpdated = initialGasUsage !== order.order.gasUsage;
    }

    if (statusChanged || (orderCreatedEvent && !orderCreatedEvent.data.metadata.processed)) {
      await saveOrderToPG(order, displayOrder);
    }

    /**
     * saves order status changes and the raw order
     */
    const saveOrderStatusEvent = async (event: OrderStatusEvent) => {
      const orderStatusChanges = db
        .collection(firestoreConstants.ORDERS_V2_COLL)
        .doc(event.orderId)
        .collection('orderStatusChanges') as CollRef<OrderStatusEvent>;

      const currentOrderStatusEvent = await txn.get(
        orderStatusChanges.where('orderId', '==', event.orderId).where('isMostRecent', '==', true)
      );

      if (currentOrderStatusEvent.docs.length > 1) {
        console.error('More than one current order status event found for order', event.orderId);
      } else if (currentOrderStatusEvent.docs.length === 1) {
        const currentEvent = currentOrderStatusEvent.docs[0].data();
        if (currentEvent.status === event.status) {
          return; // no need to save this event
        }
      }
      for (const doc of currentOrderStatusEvent.docs) {
        saves.push(() => {
          txn.set(doc.ref, { isMostRecent: false }, { merge: true });
        });
      }

      const ref = orderStatusChanges.doc(event.id);

      saves.push(() => {
        txn.create(ref, event);
      });
    };

    if (orderCreatedEvent != null) {
      const saveToFeed = await this._writeOrderToFeed(orderCreatedEvent.data, order, displayOrder, txn, db);
      saves.push(saveToFeed);
    }

    if (
      (orderCreatedEvent != null && orderCreatedEvent.data.metadata.processed === false) ||
      statusChanged ||
      gasUpdated
    ) {
      const statusChanged: OrderStatusEvent = {
        id: nanoid(),
        orderId: order.metadata.id,
        chainId: order.metadata.chainId,
        status: order.order.status,
        timestamp: Date.now(),
        order: order.rawOrder.infinityOrder,
        isMostRecent: true,
        source: order.metadata.source,
        sourceOrder: order.rawOrder.rawOrder,
        gasUsage: order.rawOrder.gasUsage,
        collection: order.order.collection
      };
      await saveOrderStatusEvent(statusChanged);
    }

    await baseOrder.save(order, displayOrder, txn);

    for (const save of saves) {
      save();
    }
  }

  protected async _writeOrderToFeed(
    orderCreatedEvent: OrderCreatedEvent,
    order: RawFirestoreOrderWithoutError,
    displayOrder: FirestoreDisplayOrderWithoutError,
    txn: FirebaseFirestore.Transaction,
    db: FirebaseFirestore.Firestore
  ) {
    const collection =
      displayOrder.displayOrder?.kind === 'single-collection'
        ? displayOrder.displayOrder.item
        : displayOrder.displayOrder.items[0]; // future-todo: support multiple collections

    const token = collection.kind === 'single-token' ? collection.token : undefined; // future-todo: support token lists
    const eventRef = db.collection(firestoreConstants.FEED_COLL).doc(orderCreatedEvent.metadata.id);
    const base: Omit<OrderBookEvent, 'isSellOrder' | 'type'> = {
      orderId: order.metadata.id,
      orderItemId: '',
      paymentToken: order.order.currency,
      quantity: order.order.numItems,
      startPriceEth: order.order.startPriceEth,
      endPriceEth: order.order.endPriceEth,
      startTimeMs: order.order.startTimeMs,
      endTimeMs: order.order.endTimeMs,
      makerAddress: order.order.maker,
      takerAddress: order.order.taker,
      makerUsername: displayOrder.displayOrder?.maker?.username ?? '',
      takerUsername: displayOrder.displayOrder?.taker?.username ?? '',
      chainId: order.metadata.chainId,
      timestamp: order.metadata.createdAt,
      likes: 0,
      comments: 0,
      collectionAddress: collection.address,
      collectionName: collection.name,
      collectionSlug: collection.slug,
      collectionProfileImage: collection.profileImage,
      hasBlueCheck: collection.hasBlueCheck,
      internalUrl: getInfinityLink({
        type: InfinityLinkType.Collection,
        addressOrSlug: collection.slug ?? collection.address,
        chainId: collection.chainId
      }),
      tokenId: token?.tokenId ?? '',
      image: token?.image ?? '',
      nftName: token?.name ?? '',
      nftSlug: token?.name ?? '',
      usersInvolved: [...order.order.owners, order.order.maker]
    };

    let event: NftListingEvent | NftOfferEvent;
    if (order.order.isSellOrder) {
      event = {
        ...base,
        type: EventType.NftListing,
        isSellOrder: true
      };
    } else {
      event = {
        ...base,
        type: EventType.NftOffer,
        isSellOrder: false
      };
    }

    const snap = await txn.get(eventRef);

    const save = () => {
      if (!snap.exists) {
        txn.create(eventRef, event);
      } else {
        console.warn(`Event: ${eventRef.path} already exists, skipping...`);
      }
    };
    return save;
  }

  protected async _getOrder(
    txn: FirebaseFirestore.Transaction,
    chainId: ChainId,
    rawOrderSnap: DocSnap<RawFirestoreOrder>,
    displayOrderSnap: DocSnap<FirestoreDisplayOrder>,
    orderCreatedEvent?: OrderCreatedEvent
  ) {
    const provider = getProvider(chainId);
    if (!provider) {
      throw new Error('invalid chain id');
    }
    const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount[chainId]);
    const db = this._getDb();

    let rawOrder = rawOrderSnap.data();
    let displayOrder = displayOrderSnap.data();
    let baseOrder: BaseOrder | undefined;

    if (orderCreatedEvent && (!rawOrder || !displayOrder)) {
      const result = await this._handleOrderCreatedEvent(orderCreatedEvent, db, provider, txn, gasSimulator);
      rawOrder = result.rawOrder;
      displayOrder = result.displayOrder;
      baseOrder = result.baseOrder;
    } else if ((!rawOrder || !displayOrder) && !orderCreatedEvent) {
      // order created event has not been created or processed yet
      throw new Error('order has not been created');
    }

    if (!rawOrder || !displayOrder) {
      throw new Error('Unexpected state encountered');
    }

    try {
      const orderUpdater = new OrderUpdater(rawOrder, displayOrder);
      return orderUpdater;
    } catch (err) {
      // throws if there is an error in the raw order or display order, in this case we should make sure the order is
      // saved in the db, mark events as processed and ignore further processing of events (but mark them as processed)
      if (baseOrder) {
        await baseOrder.save(rawOrder, displayOrder, txn);
      }
      throw new Error('invalid order');
    }
  }

  protected async _handleOrderCreatedEvent(
    event: OrderCreatedEvent,
    db: Firestore,
    provider: ethers.providers.StaticJsonRpcProvider,
    txn: FirebaseFirestore.Transaction,
    gasSimulator: GasSimulator
  ) {
    const order = event.data.order;
    const metadata = event.metadata;
    const baseOrder = new BaseOrder(order.id, metadata.chainId, metadata.isSellOrder, db, provider, gasSimulator);

    const result = await baseOrder.buildFromRawOrder(order, undefined, txn);
    return {
      rawOrder: result.rawOrder,
      displayOrder: result.displayOrder,
      baseOrder
    };
  }
}
