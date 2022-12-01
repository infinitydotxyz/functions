import { ChainId } from '@infinityxyz/lib/types/core';
import * as Sdk from '@reservoir0x/sdk';

import { FirestoreBatchEventProcessor } from '../../firestore/firestore-batch-event-processor';
import { CollRef, DocRef, QuerySnap } from '../../firestore/types';
import * as Reservoir from '../../reservoir';
import { bn } from '../../utils';
import { config } from '../../utils/config';

export type FirestoreOrderEvent = Reservoir.OrderEvents.Types.FirestoreOrderEvent;

export interface FirestoreOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    updatedAt: number;
    status: Reservoir.Api.Orders.Types.OrderStatus;
  };
  data: {
    rawOrder: any;
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

    // TODO handle the case where we have unprocessed events that aren't the most recent event

    const descendingEvents = eventsSnap.docs
      .map((item) => {
        return {
          data: item.data(),
          ref: item.ref
        };
      })
      .sort((a, b) => (bn(a.data.data.event.id).gt(bn(b.data.data.event.id)) ? -1 : 1));

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
      const isSellOrder = sampleEvent.data.metadata.isSellOrder;
      // TODO get/build order
      const reservoirOrder = await this._getReservoirOrder(orderId, sampleEvent.data.metadata.chainId, isSellOrder);
      const rawData = reservoirOrder.rawData;
      if (!rawData) {
        throw new Error('Failed to get raw order data');
      }

      const nativeOrder = Sdk;
    } else {
      const data = orderSnap.data();
      if (!data) {
        throw new Error('Order exists but is missing data');
      }
      order = data;
    }
  }

  protected async _getReservoirOrder(id: string, chainId: ChainId, isSellOrder: boolean) {
    const client = Reservoir.Api.getClient(chainId, config.reservoirApiKey);
    const OrderSide = isSellOrder ? Reservoir.Api.Orders.AskOrders : Reservoir.Api.Orders.BidOrders;
    const response = await OrderSide.getOrders(client, {
      ids: id,
      includeMetadata: true,
      includeRawData: true,
      limit: 1
    });

    const order = response.data.orders[0];

    if (!order) {
      throw new Error(`Order not found. OrderId: ${id}`);
    } else if (!order.rawData) {
      throw new Error(`Order does not have raw data. OrderId: ${id}`);
    }

    return order;
  }
}
