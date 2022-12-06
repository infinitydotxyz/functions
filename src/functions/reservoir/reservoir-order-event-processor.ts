import { ChainId, ChainOBOrder } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { FirestoreBatchEventProcessor } from '@/firestore/firestore-batch-event-processor';
import { CollRef, DocRef, QuerySnap } from '@/firestore/types';
import { Orderbook, Reservoir } from '@/lib/index';
import { bn } from '@/lib/utils';

type FirestoreOrderEvent = Reservoir.OrderEvents.Types.FirestoreOrderEvent;

export interface FirestoreOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    hasError: boolean;
  };
  error?: {
    errorCode: Orderbook.Errors.ErrorCode;
    value: string;
    source: Reservoir.Api.Orders.Types.OrderKind | 'unknown';
    type: 'unsupported' | 'unexpected';
  };
  data: {
    isSellOrder: boolean;
    rawOrder: any;
    infinityOrder: ChainOBOrder;
    gasUsage: string;
    isDynamic: boolean;
  };
  status: {
    status: Reservoir.Api.Orders.Types.OrderStatus;
    /**
     * the order is valid if it is active or inactive
     */
    isValid: boolean;
    mostRecentEvent: {
      id: string;
      orderedId: number;
      status: Reservoir.Api.Orders.Types.OrderStatus;
    };
  };
}

export class ReservoirOrderStatusEventProcessor extends FirestoreBatchEventProcessor<FirestoreOrderEvent> {
  protected _isEventProcessed(event: FirestoreOrderEvent): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = FirestoreOrderEvent>(
    ref: FirebaseFirestore.CollectionReference<Event> | FirebaseFirestore.Query<Event>
  ): FirebaseFirestore.Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanFilter<Event extends { metadata: { updatedAt: number } } = FirestoreOrderEvent>(
    query: FirebaseFirestore.Query<Event>,
    timestamp: number
  ): FirebaseFirestore.Query<Event> {
    return query.where('metadata.updatedAt', '<', timestamp);
  }

  protected async _processEvents(
    eventsSnap: QuerySnap<Reservoir.OrderEvents.Types.FirestoreOrderEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Reservoir.OrderEvents.Types.FirestoreOrderEvent>
  ): Promise<void> {
    const orderRef = eventsRef.parent as DocRef<FirestoreOrder>;
    const orderSnap = await txn.get(orderRef);

    /**
     * include the most recent event
     */
    const mostRecentEventQuery = eventsRef.orderBy('data.event.id', 'desc').limit(1);
    const mostRecentEventSnap = await txn.get(mostRecentEventQuery);

    const ids = new Set();

    const descendingEvents = [...eventsSnap.docs, ...mostRecentEventSnap.docs]
      .map((item) => {
        return {
          data: item.data(),
          ref: item.ref
        };
      })
      .sort((a, b) => (bn(a.data.data.event.id).gt(bn(b.data.data.event.id)) ? -1 : 1))
      .filter((item) => {
        if (ids.has(item.data.data.event.id)) {
          return false;
        }
        ids.add(item.data.data.event.id);
        return true;
      });

    const orderId = orderRef.id;
    const sameOrder = descendingEvents.every((event) => event.data.data.order.id === orderId);
    if (!sameOrder) {
      throw new Error(`All events must be for the same order. OrderId: ${orderId}`);
    }

    const sampleEvent = descendingEvents[0];

    if (!sampleEvent) {
      throw new Error(`No events found for order: ${orderId}`);
    }

    let order: FirestoreOrder;
    if (!orderSnap.exists) {
      // const { chainId } = sampleEvent.data.metadata;
      // const { isSellOrder } = sampleEvent.data.metadata;
      // const reservoirOrder = await this._getReservoirOrder(orderId, sampleEvent.data.metadata.chainId, isSellOrder);
      // const rawData = reservoirOrder.rawData;
      // if (!rawData) {
      //   throw new Error('Failed to get raw order data');
      // }
      // try {
      //   const factory = new Orderbook.Transformers.OrderTransformerFactory();
      //   const transformer = factory.create(chainId, reservoirOrder);
      //   const result = await transformer.transform();
      //   if (result.isNative) {
      //   }
      // } catch (err) {
      //   // TODO save error
      // }
    } else {
      const data = orderSnap.data();
      if (!data) {
        throw new Error('Order exists but is missing data');
      }
      // order = data.status.status;
    }
  }
}
