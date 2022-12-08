import { ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, DocSnap, Firestore, Query, QuerySnap } from '@/firestore/types';
import { Orderbook } from '@/lib/index';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { OrderCreatedEvent, OrderEventKind, OrderEventMetadata } from '@/lib/orderbook/order/order-events/types';
import { OrderUpdater } from '@/lib/orderbook/order/order-updater';
import { FirestoreDisplayOrder, RawFirestoreOrder } from '@/lib/orderbook/order/types';
import { getProvider } from '@/lib/utils/ethersUtils';

type OrderEvents = Orderbook.Orders.OrderEvents.Types.OrderEvents;

export class OrderEventProcessor extends FirestoreInOrderBatchEventProcessor<OrderEvents> {
  protected _applyOrderBy<Events extends { metadata: { timestamp: number } } = OrderEvents>(
    query: CollRef<Events> | Query<Events>,
    reverse?: boolean | undefined
  ): Query<Events> {
    return query.orderBy('metadata.timestamp', reverse ? 'asc' : 'desc');
  }

  protected _applyOrderByLessThan<Events extends { metadata: { timestamp: number } } = OrderEvents>(
    query: CollRef<Events> | Query<Events>,
    timestamp: number
  ): Query<Events> {
    return query.where('metadata.timestamp', '<', timestamp);
  }

  protected _isEventProcessed(event: Orderbook.Orders.OrderEvents.Types.OrderEvents): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = OrderEvents>(
    ref: CollRef<Event> | CollGroupRef<Event>
  ): Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanFilter<Event extends { metadata: { updatedAt: number } } = OrderEvents>(
    query: Query<Event>,
    timestamp: number
  ): Query<Event> {
    return query.where('metadata.updatedAt', '<', timestamp);
  }

  protected async _processEvents(
    events: QuerySnap<Orderbook.Orders.OrderEvents.Types.OrderEvents>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Orderbook.Orders.OrderEvents.Types.OrderEvents>
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

    const rawOrderRef = eventsRef.parent as DocRef<Orderbook.Orders.Types.RawFirestoreOrder>;
    const chainDisplayRef = eventsRef.firestore
      .collection('ordersV2ByChain')
      .doc(sampleEvent.chainId)
      .collection('chainV2Orders')
      .doc(rawOrderRef.id) as DocRef<Orderbook.Orders.Types.FirestoreDisplayOrder>;

    const [rawOrderSnap, chainDisplaySnap] = (await txn.getAll<any>(rawOrderRef, chainDisplayRef)) as [
      DocSnap<Orderbook.Orders.Types.RawFirestoreOrder>,
      DocSnap<Orderbook.Orders.Types.FirestoreDisplayOrder>
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

    for (const item of items) {
      const { data: event, ref } = item;

      switch (event.metadata.eventKind) {
        case OrderEventKind.Created:
        case OrderEventKind.Cancelled:
        case OrderEventKind.Expired:
        case OrderEventKind.Sale:
        case OrderEventKind.BalanceChange:
        case OrderEventKind.ApprovalChange:
        case OrderEventKind.Bootstrap:
        case OrderEventKind.Revalidation:
        case OrderEventKind.PriceUpdate: // TODO handle this differently to support dynamic orders
          orderUpdater.setStatus(event.data.status);
          break;

        default:
          throw new Error(`Unknown event kind: ${(event?.metadata as any)?.eventKind}`);
      }

      const metadataUpdate: OrderEventMetadata = {
        ...event.metadata,
        eventKind: event.metadata.eventKind,
        updatedAt: Date.now(),
        processed: true
      };

      txn.set(
        ref,
        {
          metadata: metadataUpdate as any
        },
        { merge: true }
      );
    }

    //save order
    const rawOrder = orderUpdater.rawOrder;
    const displayOrder = orderUpdater.displayOrder;
    const provider = getProvider(rawOrder.metadata.chainId);
    if (!provider) {
      throw new Error('invalid chain id');
    }
    const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
    const db = this._getDb();
    const baseOrder = new BaseOrder(
      rawOrder.metadata.id,
      rawOrder.metadata.chainId,
      rawOrder.order.isSellOrder,
      db,
      provider,
      gasSimulator
    );

    await baseOrder.save(rawOrder, displayOrder, txn);
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
    const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
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
      const orderUpdater = new OrderUpdater(db, provider, gasSimulator, rawOrder, displayOrder);
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

    const result = await baseOrder.buildFromRawOrder(order, txn);
    return {
      rawOrder: result.rawOrder,
      displayOrder: result.displayOrder,
      baseOrder
    };
  }
}
