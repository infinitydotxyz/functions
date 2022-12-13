import { ethers } from 'ethers';

import { InfinityExchangeABI } from '@infinityxyz/lib/abi/infinityExchange';
import {
  ChainId,
  FirestoreDisplayOrder,
  OrderCreatedEvent,
  OrderEventKind,
  OrderEventMetadata,
  OrderEvents,
  OrderSaleEvent,
  RawFirestoreOrder
} from '@infinityxyz/lib/types/core';
import { getExchangeAddress } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, DocSnap, Firestore, Query, QuerySnap } from '@/firestore/types';
import { Orderbook } from '@/lib/index';
import { InfinityLogDecoder } from '@/lib/orderbook/log-decoders';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { OrderUpdater } from '@/lib/orderbook/order/order-updater';
import { getProvider } from '@/lib/utils/ethersUtils';

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

  protected _isEventProcessed(event: OrderEvents): boolean {
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

    const initialStatus = orderUpdater.rawOrder.order.status;
    for (const item of items) {
      const { data: event, ref } = item;

      switch (event.metadata.eventKind) {
        case OrderEventKind.Created:
        case OrderEventKind.BalanceChange:
        case OrderEventKind.ApprovalChange:
        case OrderEventKind.Bootstrap:
        case OrderEventKind.Revalidation:
        case OrderEventKind.PriceUpdate: // TODO handle this differently to support dynamic orders
        case OrderEventKind.Cancelled:
        case OrderEventKind.Expired:
          orderUpdater.setStatus(event.data.status);
          break;
        case OrderEventKind.Sale: {
          const isNative = orderUpdater.rawOrder.metadata.source === 'infinity';

          if (isNative) {
            orderUpdater.setStatus(event.data.status);
          } else {
            const saleEvent = event as OrderSaleEvent;

            const orderHashes = await this._getSaleOrderHashes(
              saleEvent.data.txHash,
              saleEvent.metadata.chainId,
              provider
            );

            if (orderHashes.size > 0) {
              // TODO improve this to make sure the txn included this order
              orderUpdater.setStatus(event.data.status);
            } else {
              orderUpdater.setStatus('expired');
            }
          }

          break;
        }

        default:
          throw new Error(`Unknown event kind: ${(event?.metadata as unknown as any)?.eventKind}`);
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

    const finalStatus = orderUpdater.rawOrder.order.status;

    //save order
    let rawOrder = orderUpdater.rawOrder;
    let displayOrder = orderUpdater.displayOrder;
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

    const updateGasUsage = initialStatus !== finalStatus && finalStatus === 'active';
    if (updateGasUsage) {
      const gasUsage = await baseOrder.getGasUsage(rawOrder);

      orderUpdater.setGasUsage(gasUsage);

      rawOrder = orderUpdater.rawOrder;
      displayOrder = orderUpdater.displayOrder;
    }

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

    const result = await baseOrder.buildFromRawOrder(order, undefined, txn);
    return {
      rawOrder: result.rawOrder,
      displayOrder: result.displayOrder,
      baseOrder
    };
  }

  protected async _getSaleOrderHashes(
    txHash: string,
    chainId: ChainId,
    provider: ethers.providers.StaticJsonRpcProvider
  ) {
    const receipt = await provider.getTransactionReceipt(txHash);
    const logs = receipt.logs;
    const contract = new ethers.Contract(getExchangeAddress(chainId), InfinityExchangeABI, provider);
    const logDecoder = new InfinityLogDecoder(contract, chainId);

    const orderHashes = new Set();

    for (const log of logs) {
      const matchOrderEvent = logDecoder.decodeMatchOrderEvent(log);
      const takeOrderEvent = logDecoder.decodeTakeOrderEvent(log);
      if (matchOrderEvent?.buyOrderHash) {
        orderHashes.add(matchOrderEvent.buyOrderHash);
      }
      if (matchOrderEvent?.sellOrderHash) {
        orderHashes.add(matchOrderEvent.sellOrderHash);
      }
      if (takeOrderEvent?.orderHash) {
        orderHashes.add(takeOrderEvent.orderHash);
      }
    }
    return orderHashes;
  }
}
