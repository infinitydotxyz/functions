import { saveOrderToPG } from 'functions/orderbook/save-order-to-pg';
import PQueue from 'p-queue';

import { RawFirestoreOrder, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { Query } from '@/firestore/types';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { getProvider } from '@/lib/utils/ethersUtils';

import { config } from '../config';

// const backfillOrdersToPG = async () => {
//   const db = getDb();
//   const saleCreatedEventsQuery = db
//     .collectionGroup('orderEvents')
//     .where('data.order.source', '==', 'seaport')
//     .where('metadata.chainId', '==', '1')
//     .where('metadata.eventKind', '==', OrderEventKind.Created)
//     .where('metadata.isSellOrder', '==', true)
//     .orderBy('metadata.timestamp', 'asc')
//     .orderBy('metadata.orderId', 'asc') as Query<OrderCreatedEvent>;

//   const offerCreatedEventsQuery = db
//     .collectionGroup('orderEvents')
//     .where('data.order.source', '==', 'seaport')
//     .where('metadata.chainId', '==', '1')
//     .where('metadata.eventKind', '==', OrderEventKind.Created)
//     .where('metadata.isSellOrder', '==', false)
//     .orderBy('metadata.timestamp', 'asc')
//     .orderBy('metadata.orderId', 'asc') as Query<OrderCreatedEvent>;

//   const infinitySaleCreatedEventsQuery = db
//     .collectionGroup('orderEvents')
//     .where('data.order.source', '==', 'infinity')
//     .where('metadata.chainId', '==', '1')
//     .where('metadata.eventKind', '==', OrderEventKind.Created)
//     .where('metadata.isSellOrder', '==', true)
//     .orderBy('metadata.timestamp', 'asc')
//     .orderBy('metadata.orderId', 'asc') as Query<OrderCreatedEvent>;
//   const infinityOfferCreatedEventsQuery = db
//     .collectionGroup('orderEvents')
//     .where('data.order.source', '==', 'infinity')
//     .where('metadata.chainId', '==', '1')
//     .where('metadata.eventKind', '==', OrderEventKind.Created)
//     .where('metadata.isSellOrder', '==', false)
//     .orderBy('metadata.timestamp', 'asc')
//     .orderBy('metadata.orderId', 'asc') as Query<OrderCreatedEvent>;

//   const queue = new PQueue({ concurrency: 10 });

//   const queries = [
//     saleCreatedEventsQuery,
//     offerCreatedEventsQuery,
//     infinityOfferCreatedEventsQuery,
//     infinitySaleCreatedEventsQuery
//   ];

//   let num = 0;
//   for (const item of queries) {
//     queue
//       .add(async () => {
//         const orderCreatedEvents = streamQueryWithRef(item, (item) => {
//           return [item.metadata.timestamp, item.metadata.orderId];
//         });
//         const batch = new BatchHandler();
//         for await (const { data, ref } of orderCreatedEvents) {
//           const update = { metadata: { ...data.metadata, processed: false } };
//           await batch.addAsync(ref, update, { merge: true });
//           num += 1;
//           if (num % 100 === 0) {
//             console.log(`Processed ${num} events. Queries running ${queue.pending}`);
//           }
//         }
//         await batch.flush();
//       })
//       .catch((err) => {
//         console.error(err);
//       });
//   }

//   console.log(`Waiting for all queries to complete`);
//   await queue.onIdle();
//   console.log(`Complete`);
// };

const backfillOrdersToPGV2 = async () => {
  const queue = new PQueue({ concurrency: 50 });

  const db = getDb();

  const validOrders = db.collection('ordersV2').where('order.isValid', '==', true) as Query<RawFirestoreOrder>;

  const stream = streamQueryWithRef(validOrders, undefined, { pageSize: 500 });

  let num = 0;
  let enqueuedAll = false;
  for await (const { data } of stream) {
    queue
      .add(async () => {
        if (data.order) {
          try {
            num += 1;
            if (num % 100 === 0) {
              console.log(
                `Processed ${num} events. \t Pending ${queue.pending} \t Remaining ${queue.size}. \t Enqueued all ${enqueuedAll}`
              );
            }
            const provider = getProvider(data.metadata.chainId);
            const gasSimulator = new GasSimulator(provider, config.orderbook.gasSimulationAccount);
            const order = new BaseOrder(
              data.metadata.id,
              data.metadata.chainId,
              data.order.isSellOrder,
              db,
              provider,
              gasSimulator
            );

            const { rawOrder, displayOrder } = await order.load();

            if (rawOrder.order && !rawOrder.metadata.hasError && !('error' in displayOrder)) {
              await saveOrderToPG(rawOrder as RawFirestoreOrderWithoutError, displayOrder);
            }
          } catch (err) {
            console.error(err);
          }
        }
      })
      .catch((err) => console.error(err));
  }
  enqueuedAll = true;
  await queue.onIdle();
  console.log(`Complete. Processed ${num} orders`);
};

void backfillOrdersToPGV2();
