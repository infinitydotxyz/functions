import { readFile, writeFile } from 'fs/promises';
import { getPGOrder, saveOrdersBatchToPG } from 'functions/orderbook/save-order-to-pg';
import PQueue from 'p-queue';
import { resolve } from 'path';

import {
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { DocRef, DocSnap, Query } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

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

  const checkpointFile = resolve(`sync/backfilled-orders-to-pg-${config.isDev ? 'dev' : 'prod'}.txt`);
  const checkpoint = await readFile(checkpointFile, 'utf8');

  const saveCheckpoint = async (id: string) => {
    await writeFile(checkpointFile, id);
  };

  const db = getDb();

  console.log(`Loading supported collections...`);
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();
  console.log(`Loaded ${[...supportedCollections.values()].length} supported collections`);

  let validOrders = db.collection('ordersV2').where('order.isValid', '==', true) as Query<RawFirestoreOrder>;

  if (checkpoint) {
    console.log(`Continuing from last checkpoint: ${checkpoint}`);
    const startAfterRef = db.collection('ordersV2').doc(checkpoint);
    validOrders = validOrders.startAfter(startAfterRef);
  }

  const stream = streamQueryPageWithRef(validOrders, undefined, {
    pageSize: 5000,
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
  let pageNum = 0;
  const startedAt = Date.now();
  for await (const page of stream) {
    const thisPageNum = (pageNum += 1);
    console.log(`Enqueueing page ${thisPageNum} of ${page.length} orders for backfilling`);
    queue
      .add(async () => {
        const lastItem = page[page.length - 1];
        const startAfter = lastItem?.ref.id;

        const filtered = page.filter((item) => {
          if (!item) {
            return false;
          }
          const id = `${item.data.metadata.chainId}:${item.data.order.collection}`;
          if (!supportedCollections.has(id)) {
            return false;
          }
          return true;
        }) as {
          data: RawFirestoreOrderWithoutError;
          ref: FirebaseFirestore.DocumentReference<RawFirestoreOrder>;
          displayOrderRef: DocRef<FirestoreDisplayOrder>;
        }[];

        console.log(`Page ${thisPageNum} has ${filtered.length} supported orders`);

        if (filtered.length > 0) {
          const displayOrdersSnap = (await db.getAll(
            ...filtered.map((item) => item.displayOrderRef)
          )) as DocSnap<FirestoreDisplayOrder>[];

          const orders = (
            filtered
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
            }[]
          ).map((item) => {
            return getPGOrder(item.order, item.displayOrder);
          });

          await saveOrdersBatchToPG(orders);
          num += orders.length;

          const rate = num / ((Date.now() - startedAt) / 1000);
          console.log(
            `Saved page. Orders backfilled ${num}. \t Pending ${queue.pending} \t Remaining ${
              queue.size
            }. \t Enqueued all ${enqueuedAll} \t Rate ${rate.toFixed(2)} orders/sec \n\tStart after ${startAfter}.`
          );
        }

        if (startAfter) {
          await saveCheckpoint(startAfter);
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
