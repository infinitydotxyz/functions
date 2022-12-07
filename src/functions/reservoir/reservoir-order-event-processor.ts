import { ChainId, ChainOBOrder } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import { FirestoreBatchEventProcessor } from '@/firestore/firestore-batch-event-processor';
import { CollRef, DocRef, QuerySnap } from '@/firestore/types';
import { Orderbook, Reservoir } from '@/lib/index';
import { RawFirestoreOrder } from '@/lib/orderbook/order/types';
import { bn } from '@/lib/utils';
import { getProvider } from '@/lib/utils/ethersUtils';

type FirestoreOrderEvent = Reservoir.OrderEvents.Types.FirestoreOrderEvent;

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
    const orderRef = eventsRef.parent as DocRef<RawFirestoreOrder>;
    const events = [...eventsSnap.docs].map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    const orderId = orderRef.id;
    const sameOrder = events.every((event) => event.data.data.order.id === orderId);
    if (!sameOrder) {
      throw new Error(`All events must be for the same order. OrderId: ${orderId}`);
    }

    const sampleEvent = events[0];

    if (!sampleEvent) {
      throw new Error(`No events found for order: ${orderId}`);
    }
    const { chainId } = sampleEvent.data.metadata;
    const { isSellOrder } = sampleEvent.data.metadata;
    const provider = getProvider(chainId);
    if (!provider) {
      throw new Error(`No provider found for chainId: ${chainId}`);
    }
    const simulationAccount = trimLowerCase('0x74265Fc35f4df36d36b4fF18362F14f50790204F');
    const gasSimulator = new Orderbook.Orders.GasSimulator(provider, simulationAccount);

    const order = new Orderbook.Orders.Order(orderId, chainId, isSellOrder, orderRef.firestore, provider, gasSimulator);
    const orderStatus = await order.getOrderStatus(txn);

    const { rawOrder, displayOrder, requiresSave } = await order.load(txn);
    if (requiresSave) {
      await order.save(rawOrder, displayOrder, txn);
    } else if (orderStatus !== rawOrder.order?.status) {
      const update = await order.refresh(txn);
      await order.save(update.rawOrder, update.displayOrder, txn);
    }

    for (const event of events) {
      event.data.metadata;
      const update: Pick<Reservoir.OrderEvents.Types.FirestoreOrderEvent, 'metadata'> = {
        metadata: {
          ...event.data.metadata,
          processed: true,
          updatedAt: Date.now()
        }
      };

      txn.set(event.ref, update, { merge: true });
    }
  }
}
