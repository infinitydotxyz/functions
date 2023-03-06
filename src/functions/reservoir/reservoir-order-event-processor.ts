import {
  OrderApprovalChangeEvent,
  OrderBalanceChangeEvent,
  OrderBootstrapEvent,
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderEventKind,
  OrderEventMetadata,
  OrderEvents,
  OrderExpiredEvent,
  OrderPriceUpdateEvent,
  OrderRevalidationEvent,
  OrderSaleEvent,
  OrderSource,
  RawFirestoreOrder,
  RawOrder
} from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { FirestoreBatchEventProcessor } from '@/firestore/event-processors/firestore-batch-event-processor';
import { CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { Orderbook, Reservoir } from '@/lib/index';
import { ErrorCode, OrderError, OrderSideError } from '@/lib/orderbook/errors';
import { OrderStatus } from '@/lib/reservoir/api/orders/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

/**
 * Once reservoir order events have been scraped and stored in firestore
 * we need to convert them to FirestoreOrderEvents and store those
 * for processing by the orderbook
 *
 * This class is responsible for processing ReservoirOrderEvents by
 * 1. transforming them to the Infinity OrderEvent format
 * 2. building a raw order for order created events
 * 3. storing the infinity order event to be processed by the orderbook handlers
 */
export class ReservoirOrderStatusEventProcessor extends FirestoreBatchEventProcessor<ReservoirOrderEvent> {
  protected _isEventProcessed(event: ReservoirOrderEvent): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = ReservoirOrderEvent>(
    ref: FirebaseFirestore.CollectionReference<Event> | FirebaseFirestore.Query<Event>
  ): FirebaseFirestore.Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter<
    Event extends { metadata: { updatedAt: number; id: string } } = ReservoirOrderEvent
  >(
    query: Query<Event>,
    timestamp: number
  ): {
    query: Query<Event>;
    getStartAfterField: (item: Event, ref: DocRef<Event>) => (string | number | DocRef<Event>)[];
  } {
    const q = query
      .where('metadata.updatedAt', '<', timestamp)
      .orderBy('metadata.updatedAt', 'asc')
      .orderBy('metadata.id', 'asc');

    const getStartAfterField = (item: Event) => {
      return [item.metadata.updatedAt, item.metadata.id];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    eventsSnap: QuerySnap<Reservoir.OrderEvents.Types.ReservoirOrderEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Reservoir.OrderEvents.Types.ReservoirOrderEvent>
  ): Promise<void> {
    const orderRef = eventsRef.parent as DocRef<RawFirestoreOrder>;
    const events = [...eventsSnap.docs].map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    /**
     * Assertions
     */
    const orderId = orderRef.id;
    const sameOrder = events.every((event) => event.data.data.order.id === orderId);
    if (!sameOrder) {
      throw new Error(`All events must be for the same order. OrderId: ${orderId}`);
    }
    const sampleEvent = events[0];
    if (!sampleEvent) {
      throw new Error(`No events found: ${orderId}`);
    }

    const successful = [];
    const skipped = [];
    const failed = [];
    for (const event of events) {
      const { data, metadata } = event.data;
      try {
        const transformedEvent = await this._transformEvent({ data, metadata }, txn);

        if (transformedEvent.metadata.eventKind !== OrderEventKind.PriceUpdate) {
          const transformedEventRef = orderRef
            .collection('orderEvents')
            .doc(transformedEvent.metadata.id) as DocRef<OrderEvents>;
          const reservoirEventUpdate: Pick<ReservoirOrderEvent, 'metadata'> = {
            metadata: {
              ...event.data.metadata,
              processed: true,
              updatedAt: Date.now()
            }
          };

          const result = {
            transformedEvent,
            transformedEventRef,
            reservoirEventUpdate: reservoirEventUpdate,
            reservoirEventRef: event.ref,
            requiresSave: !event.data.metadata.processed
          };
          successful.push(result);
        } else {
          const reservoirEventUpdate: Pick<ReservoirOrderEvent, 'metadata'> = {
            metadata: {
              ...event.data.metadata,
              processed: true,
              updatedAt: Date.now()
            }
          };

          const result = {
            reservoirEventUpdate: reservoirEventUpdate,
            reservoirEventRef: event.ref
          };
          skipped.push(result);
        }
      } catch (err) {
        let error;
        if (err instanceof OrderError) {
          error = err.toJSON();
        } else if (err instanceof Error) {
          const message = err.message;
          error = {
            errorCode: ErrorCode.Unexpected,
            value: 'unknown',
            source: 'unknown',
            reason: message,
            type: 'unknown'
          };
        } else {
          error = {
            errorCode: ErrorCode.Unexpected,
            value: 'unknown',
            source: 'unknown',
            reason: 'unknown',
            type: 'unknown'
          };
        }
        const reservoirEventUpdate: Pick<ReservoirOrderEvent, 'metadata' | 'error'> = {
          metadata: {
            ...event.data.metadata,
            processed: true,
            updatedAt: Date.now(),
            hasError: true
          },
          error
        };
        const result = {
          reservoirEventUpdate: reservoirEventUpdate,
          reservoirEventRef: event.ref
        };
        failed.push(result);
      }
    }

    const transformedEventsSnaps =
      successful.length > 0 ? await txn.getAll(...successful.map((item) => item.transformedEventRef)) : [];

    const handledEvents = new Set();
    for (let resultIndex = 0; resultIndex < successful.length; resultIndex += 1) {
      const transformedEventSnap = transformedEventsSnaps[resultIndex];
      const result = successful[resultIndex];

      if (transformedEventSnap.ref.id !== result.transformedEventRef.id) {
        throw new Error(
          `Mismatched transformed event refs: ${transformedEventSnap.ref.id} !== ${result.transformedEventRef.id}`
        );
      }

      /**
       * only save the event if it doesn't already exist
       */
      if (!transformedEventSnap.exists && !handledEvents.has(transformedEventSnap.ref.path)) {
        handledEvents.add(transformedEventSnap.ref.path);
        txn.create(result.transformedEventRef, result.transformedEvent);
      }

      if (!handledEvents.has(result.reservoirEventRef.path) && result.requiresSave) {
        /**
         * update the reservoir event as processed
         * if it has not been processed yet
         */
        handledEvents.add(result.reservoirEventRef.path);
        txn.set(result.reservoirEventRef, result.reservoirEventUpdate, { merge: true });
      } else {
        /**
         * mark it as handled
         */
        handledEvents.add(result.reservoirEventRef.path);
      }
    }

    for (const item of skipped) {
      if (!handledEvents.has(item.reservoirEventRef.path)) {
        /**
         * update any skipped reservoir events as processed
         */
        txn.set(item.reservoirEventRef, item.reservoirEventUpdate, { merge: true });
        handledEvents.add(item.reservoirEventRef.path);
      }
    }

    for (const item of failed) {
      if (!handledEvents.has(item.reservoirEventRef.path)) {
        txn.set(item.reservoirEventRef, item.reservoirEventUpdate, { merge: true });
        handledEvents.add(item.reservoirEventRef.path);
      }
    }
  }

  protected async _transformEvent(
    { data, metadata }: ReservoirOrderEvent,
    txn?: FirebaseFirestore.Transaction
  ): Promise<OrderEvents> {
    let timestamp;

    if (data.event.createdAt) {
      timestamp = new Date(data.event.createdAt).getTime();
    } else if (data.event.txTimestamp) {
      timestamp = data.event.txTimestamp * 1000;
    } else {
      throw new Error(`No timestamp found for event: ${JSON.stringify(data)}`);
    }

    const baseMetadata: Omit<OrderEventMetadata, 'eventKind' | 'id'> = {
      isSellOrder: metadata.isSellOrder,
      orderId: metadata.orderId,
      chainId: metadata.chainId,
      processed: false,
      migrationId: 1,
      timestamp,
      updatedAt: Date.now(),
      eventSource: 'reservoir'
    };

    const getTxnData = () => {
      const txHash = data.event.txHash ?? '';
      const txTimestamp = data.event.txTimestamp ?? Math.floor(new Date(data.event.createdAt ?? 0).getTime() / 1000);

      return {
        txHash: txHash,
        txTimestamp: txTimestamp,
        txTimestampMs: txTimestamp * 1000
      };
    };

    switch (data.event.kind) {
      case 'approval-change': {
        const txnData = getTxnData();
        const approvalEvent: OrderApprovalChangeEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.ApprovalChange,
            id: `${OrderEventKind.ApprovalChange}:${txnData.txHash}`
          },
          data: {
            txHash: txnData.txHash,
            txTimestamp: txnData.txTimestamp,
            status: metadata.status
          }
        };
        return approvalEvent;
      }
      case 'balance-change': {
        const txnData = getTxnData();
        const balanceEvent: OrderBalanceChangeEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.BalanceChange,
            id: `${OrderEventKind.BalanceChange}:${txnData.txHash}`
          },
          data: {
            txHash: txnData.txHash,
            txTimestamp: txnData.txTimestamp,
            status: metadata.status
          }
        };
        return balanceEvent;
      }
      case 'bootstrap': {
        const bootstrapEvent: OrderBootstrapEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Bootstrap,
            id: `${metadata.id}`
          },
          data: {
            status: metadata.status
          }
        };
        return bootstrapEvent;
      }
      case 'cancel': {
        const txnData = getTxnData();
        const cancelEvent: OrderCancelledEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Cancelled,
            id: `${OrderEventKind.Cancelled}:${txnData.txHash}`
          },
          data: {
            txHash: txnData.txHash,
            txTimestamp: txnData.txTimestamp,
            status: metadata.status
          }
        };

        return cancelEvent;
      }

      case 'expiry': {
        const expiryEvent: OrderExpiredEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Expired,
            id: `${metadata.id}`
          },
          data: {
            status: metadata.status
          }
        };
        return expiryEvent;
      }
      case 'new-order': {
        const { rawOrder, status } = await this._getRawOrder({ data, metadata }, this._getDb(), txn);
        const orderCreatedEvent: OrderCreatedEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Created,
            id: `${OrderEventKind.Created}:${rawOrder.id}`
          },
          data: {
            isNative: data.order.source.toLowerCase() === 'flow',
            order: rawOrder,
            status
          }
        };
        return orderCreatedEvent;
      }
      case 'reprice': {
        const priceUpdateEvent: OrderPriceUpdateEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.PriceUpdate,
            id: `${metadata.id}`
          },
          data: {
            status: metadata.status
          }
        };
        return priceUpdateEvent;
      }
      case 'revalidation': {
        const revalidationEvent: OrderRevalidationEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Revalidation,
            id: `${metadata.id}`
          },
          data: {
            status: metadata.status
          }
        };
        return revalidationEvent;
      }
      case 'sale': {
        const txnData = getTxnData();
        const saleEvent: OrderSaleEvent = {
          metadata: {
            ...baseMetadata,
            eventKind: OrderEventKind.Sale,
            id: `${OrderEventKind.Sale}:${txnData.txHash}`
          },
          data: {
            txHash: txnData.txHash,
            txTimestamp: txnData.txTimestamp,
            status: metadata.status
          }
        };

        return saleEvent;
      }
      default:
        throw new Error(`Unhandled reservoir event kind: ${data.event.kind}`);
    }
  }

  protected async _getRawOrder(
    { data, metadata }: ReservoirOrderEvent,
    db: FirebaseFirestore.Firestore,
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ rawOrder: RawOrder; status: OrderStatus }> {
    const provider = getProvider(metadata.chainId);
    if (!provider) {
      throw new Error(`No provider found for chainId: ${metadata.chainId}`);
    }

    const isFlow =
      ('kind' in data.order && data.order.kind === 'flow') ||
      ('source' in data.order && data.order.source.toLowerCase().includes('flow'));
    if (!metadata.isSellOrder && !isFlow) {
      /**
       * prevent unnecessary processing
       */
      const kind = 'kind' in data.order ? data.order.kind : 'unknown';
      // TODO remove this to support other marketplace buy orders
      throw new OrderSideError(metadata.isSellOrder, kind as OrderSource, 'unsupported');
    }

    const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
    const orderId = data.order.id;

    const order = new Orderbook.Orders.Order(
      orderId,
      metadata.chainId,
      metadata.isSellOrder,
      db,
      provider,
      gasSimulator
    );

    const { rawOrder } = await order.load(txn);

    if (!rawOrder.rawOrder) {
      if ('error' in rawOrder) {
        const reason =
          'reason' in rawOrder.error && typeof rawOrder.error.reason === 'string' ? rawOrder.error.reason : 'unknown';
        throw new OrderError(
          reason,
          rawOrder.error.errorCode,
          rawOrder.error.value,
          rawOrder.error.source,
          rawOrder.error.type
        );
      }
      throw new Error(`No raw order found for order: ${orderId}`);
    }
    let status: OrderStatus;
    if (rawOrder.metadata.hasError) {
      status = 'inactive';
    } else {
      status = metadata.status ?? rawOrder.order?.status ?? 'inactive';
    }
    return { rawOrder: rawOrder.rawOrder, status };
  }
}
