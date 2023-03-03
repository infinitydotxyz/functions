/* eslint-disable no-constant-condition */
import PQueue from 'p-queue';

import {
  ChainId,
  OrderCreatedEvent,
  OrderEventKind,
  OrderEventMetadata,
  OrderSource
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/utils/ethersUtils';

import { Orderbook, Reservoir } from '../..';
import { AskOrder } from '../api/orders/types';

export async function backfillActiveListings(chainId: ChainId, collection: string, db: FirebaseFirestore.Firestore) {
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const provider = getProvider(chainId);
  const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);

  let continuation: string | undefined = undefined;

  const batchHandler = new BatchHandler();
  let totalOrdersSaved = 0;
  const pageSize = 1000;
  while (true) {
    const result: {
      data: {
        orders: AskOrder[];
        continuation: string | undefined;
      };
      statusCode: number;
    } = await Reservoir.Api.Orders.AskOrders.getOrders(client, {
      contracts: [collection],
      source: 'opensea.io',
      includePrivate: false,
      includeCriteriaMetadata: false,
      includeRawData: true,
      normalizeRoyalties: false,
      sortBy: 'createdAt',
      continuation,
      limit: pageSize
    });

    if (result.statusCode !== 200) {
      logger.log('backfill-active-orders', 'Error fetching orders', result.statusCode, result.data);
      await sleep(5000);
      continue;
    }

    const numOrders = result.data.orders.length;
    let numOrdersSaved = 0;
    logger.log('backfill-active-orders', 'Fetched', numOrders, 'orders');

    const items: {
      ref: FirebaseFirestore.DocumentReference<OrderCreatedEvent>;
      event: OrderCreatedEvent;
    }[] = [];

    const queue = new PQueue({ concurrency: 10 });

    for (const item of result.data.orders) {
      queue
        .add(async () => {
          let timestamp;
          if (item.createdAt) {
            timestamp = new Date(item.createdAt).getTime();
          } else {
            throw new Error(`No timestamp found for event: ${JSON.stringify(item)}`);
          }

          const baseMetadata: Omit<OrderEventMetadata, 'eventKind' | 'id'> = {
            isSellOrder: true,
            orderId: item.id,
            chainId: chainId,
            processed: false,
            migrationId: 1,
            timestamp,
            updatedAt: Date.now(),
            eventSource: 'reservoir'
          };

          const order = new Orderbook.Orders.Order(item.id, chainId, true, db, provider, gasSimulator);

          logger.log('backfill-active-orders', `Loading order ${item.id}...`);
          const { rawOrder } = await order.load(undefined, item);
          if (!rawOrder.rawOrder) {
            logger.log('backfill-active-orders', 'Error loading order', item.id, JSON.stringify(rawOrder, null, 2));
            return;
          }

          const orderCreatedEvent: OrderCreatedEvent = {
            metadata: {
              ...baseMetadata,
              eventKind: OrderEventKind.Created,
              id: `${OrderEventKind.Created}:${item.id}`
            },
            data: {
              isNative: false,
              order: rawOrder.rawOrder,
              status: 'active'
            }
          };

          const orderCreatedEventRef = db
            .collection(firestoreConstants.ORDERS_V2_COLL)
            .doc(item.id)
            .collection(firestoreConstants.ORDER_EVENTS_COLL)
            .doc(orderCreatedEvent.metadata.id) as FirebaseFirestore.DocumentReference<OrderCreatedEvent>;

          items.push({
            ref: orderCreatedEventRef,
            event: orderCreatedEvent
          });
        })
        .catch((err) => {
          logger.log('backfill-active-orders', 'Error processing order', item.id, err);
        });
    }

    await queue.onIdle();

    const refs = items.map((item) => item.ref);
    if (refs.length > 0) {
      const snap = await db.getAll(...refs);

      for (let index = 0; index < snap.length; index++) {
        const docSnap = snap[index];
        const item = items[index];

        if (!item || !docSnap) {
          throw new Error('Invalid item or docSnap');
        } else if (item.ref.id !== docSnap.ref.id) {
          throw new Error('Ids do not match');
        }

        if (!docSnap.exists) {
          logger.log('backfill-active-orders', `Saving create order event ${item.ref.path}`);
          await batchHandler.addAsync(docSnap.ref, item.event, { merge: false });
          numOrdersSaved += 1;
        }
      }
    }
    await batchHandler.flush();

    logger.log('backfill-active-orders', 'Saved', numOrdersSaved, 'orders');

    totalOrdersSaved += numOrdersSaved;
    if (numOrders < pageSize) {
      logger.log('backfill-active-orders', `Fetched all orders. Expected:${pageSize} Actual:${numOrders}}`);
      break;
    } else if (continuation === result.data.continuation) {
      logger.log('backfill-active-orders', 'Fetched all orders. Continuation did not change');
      break;
    } else {
      logger.log('backfill-active-orders', 'Continuation updated, continuing to next page', result.data.continuation);
      continuation = result.data.continuation;
    }
  }

  logger.log('backfill-active-orders', `Backfilled ${totalOrdersSaved} orders for collection ${collection}`);
}
