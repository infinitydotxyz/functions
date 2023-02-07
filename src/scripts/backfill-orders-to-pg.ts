import { saveOrdersBatchToPG } from 'functions/orderbook/save-order-to-pg';
import PQueue from 'p-queue';

import {
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { DocRef, DocSnap, Query } from '@/firestore/types';

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

  const stream = streamQueryPageWithRef(validOrders, undefined, {
    pageSize: 500,
    transformItem: (item) => {
      if (item) {
        const { data, ref } = item;

        if (data.rawOrder && !('error' in data.rawOrder)) {
          const displayOrderRef = db
            .collection('ordersV2ByChain')
            .doc(data.metadata.chainId)
            .collection('chainV2Orders')
            .doc(data.metadata.id) as DocRef<FirestoreDisplayOrder>;
          return {
            data: data as RawFirestoreOrderWithoutError,
            ref,
            displayOrderRef
          };
        }
      }
    }
  });

  let num = 0;
  let enqueuedAll = false;
  const startedAt = Date.now();
  for await (const page of stream) {
    queue
      .add(async () => {
        const filtered = page.filter((item) => !!item) as {
          data: RawFirestoreOrderWithoutError;
          ref: FirebaseFirestore.DocumentReference<RawFirestoreOrder>;
          displayOrderRef: DocRef<FirestoreDisplayOrder>;
        }[];

        if (filtered.length > 0) {
          const displayOrdersSnap = (await db.getAll(
            ...filtered.map((item) => item.displayOrderRef)
          )) as DocSnap<FirestoreDisplayOrder>[];

          const orders = filtered
            .map((item, index) => {
              const displayOrderSnap = displayOrdersSnap[index];
              const { data } = item;
              if (displayOrderSnap && data) {
                const displayOrder = displayOrderSnap.data();
                if (displayOrder && !displayOrder.error && displayOrder.displayOrder) {
                  return {
                    order: data,
                    displayOrder: displayOrder
                  };
                }
              }
            })
            .filter((item) => !!item) as {
            order: RawFirestoreOrderWithoutError;
            displayOrder: FirestoreDisplayOrderWithoutError;
          }[];

          await saveOrdersBatchToPG(orders);
          num += page.length;

          const lastItem = page[page.length - 1];
          const startAfter = lastItem?.ref.id;

          const rate = num / ((Date.now() - startedAt) / 1000);
          console.log(
            `Saved page. Orders backfilled ${num}. \t Pending ${queue.pending} \t Remaining ${
              queue.size
            }. \t Enqueued all ${enqueuedAll} \t Rate ${rate.toFixed(2)} orders/sec \n\tStart after ${startAfter}.`
          );
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }

  enqueuedAll = true;
  await queue.onIdle();
  console.log(`Complete. Processed ${num} orders`);
};

void backfillOrdersToPGV2();
