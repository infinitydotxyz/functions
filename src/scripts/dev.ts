import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
import PQueue from 'p-queue';

import { ChainId, OrderEvents, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { paginatedTransaction } from '@/firestore/paginated-transaction';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef } from '@/firestore/types';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { getProvider } from '@/lib/utils/ethersUtils';

import { config } from '../config';

// async function reservoirOrderProcessor(id: string) {
//   class Dev extends ReservoirOrderStatusEventProcessor {
//     async process(
//       eventsSnap: QuerySnap<ReservoirOrderEvent>,
//       txn: FirebaseFirestore.Transaction,
//       eventsRef: CollRef<ReservoirOrderEvent>
//     ) {
//       await this._processEvents(eventsSnap, txn, eventsRef);
//     }
//   }

//   const processor = new Dev(
//     {
//       docBuilderCollectionPath: `ordersV2/{orderId}/reservoirOrderEvents`,
//       batchSize: 100,
//       maxPages: 3,
//       minTriggerInterval: ONE_MIN,
//       id: 'merger'
//     },
//     {
//       schedule: 'every 5 minutes',
//       tts: ONE_MIN
//     },
//     getDb
//   );

//   const db = getDb();
//   const start = Date.now();
//   const eventsRef = db
//     .collection('ordersV2')
//     .doc(id)
//     .collection('reservoirOrderEvents') as CollRef<ReservoirOrderEvent>;
//   const query = eventsRef
//     .where('metadata.processed', '==', false)
//     .where('metadata.updatedAt', '<', start)
//     .limit(100) as Query<ReservoirOrderEvent>;

//   const snap = await query.get();

//   await db.runTransaction(async (txn) => {
//     await processor.process(snap, txn, eventsRef);
//   });
// }

async function orderEventProcessor(id: string) {
  class Dev extends OrderEventProcessor {
    async process(eventsRef: CollRef<OrderEvents>) {
      const eventsForProcessing = await this._getEventsForProcessing(eventsRef);

      const res = await paginatedTransaction(
        eventsForProcessing.query,
        this.db,
        { pageSize: this._config.batchSize, maxPages: this._config.maxPages },
        async ({ data, txn, hasNextPage }) => {
          console.log(`Processing ${data.docs.length} events`);

          const firstItem = data.docs[0].ref.id;
          const lastItem = data.docs[data.docs.length - 1].ref.id;
          console.log(firstItem, lastItem);

          await this._processEvents(data, txn, eventsRef);
          if (!hasNextPage) {
            console.log(`NO MORE PAGES!`);
            // await markAsProcessed(ref, txn);
          }
        },
        eventsForProcessing.applyStartAfter
      );

      // await this._processEvents(eventsSnap, txn, eventsRef);
    }

    async backup() {
      const db = this._getDb();

      const debugData = {
        numItemsTriggered: 0,
        numItemsNotTriggered: 0,
        numDuplicatedFound: 0,
        firstItemTriggered: '',
        numItemsFailed: 0
      };

      const eventsRef = db.collectionGroup(this.collectionName) as CollGroupRef<any>;

      const unProcessedEvents = this._getUnProcessedEvents(eventsRef);
      const staleIfUpdatedBefore = Date.now() - this._backupOptions.tts;
      const { query: staleUnProcessedEvents, getStartAfterField } = this._applyUpdatedAtLessThanAndOrderByFilter(
        unProcessedEvents,
        staleIfUpdatedBefore
      );

      let query = staleUnProcessedEvents;
      if (!this._config.isCollectionGroup) {
        query = query.limit(1);
      }

      const stream = streamQueryWithRef(query, getStartAfterField);

      const queue = new PQueue();

      const handledTriggers = new Set<string>();
      for await (const item of stream) {
        try {
          const parentPath = item.ref.parent.parent?.path;
          if (parentPath && !handledTriggers.has(parentPath)) {
            handledTriggers.add(parentPath);
            queue
              .add(async () => {
                const { triggered } = await this._initiateProcessing(item.ref, false);
                if (triggered) {
                  debugData.numItemsTriggered += 1;
                } else {
                  debugData.numItemsNotTriggered += 1;
                }
              })
              .catch((err) => {
                console.error(`Failed to trigger processing for ${item.ref.path}`, err);
                debugData.numItemsFailed += 1;
              });
          } else {
            debugData.numDuplicatedFound += 1;
          }
        } catch (err) {
          debugData.numItemsFailed += 1;
        }
      }
      console.log('Waiting for queue to finish');
      await queue.onIdle();

      console.log('Queue finished');

      // if (this._debug) {
      console.log(
        `Scheduled backup completed for: ${this.collectionName}. Is collection group: ${this._config.isCollectionGroup}`,
        `Triggered: ${debugData.numItemsTriggered}, Not triggered: ${debugData.numItemsNotTriggered}, Duplicates: ${debugData.numDuplicatedFound}, Failed: ${debugData.numItemsFailed}`
      );
      // }
    }
  }

  const processor = new Dev(
    {
      docBuilderCollectionPath: `ordersV2/{orderId}/orderEvents`,
      batchSize: 100,
      maxPages: 3,
      minTriggerInterval: ONE_MIN,
      id: 'processor'
    },
    {
      schedule: 'every 5 minutes',
      tts: ONE_MIN
    },
    getDb
  );

  const db = getDb();

  // await processor.backup();
  const start = Date.now();
  const eventsRef = db.collection('ordersV2').doc(id).collection('orderEvents') as CollRef<OrderEvents>;

  await processor.process(eventsRef);

  console.log('Done');
}

async function main() {
  // await orderEventProcessor('0x2382a4bae36552c3b3b4aeff49d03613f942d28e272cddd385b5a61968b40d13');
  // const id = '0x0282ca845b57722c7f9d65d6652f2e573a215c5cfcefa14d07226a74352a69ad';
  // const db = getDb();
  // await getDb().collection('ordersV2').doc(id).delete();
  // await reservoirOrderProcessor(id);
  // await orderEventProcessor(id);
  // await triggerOrderEvents();
  await Promise.resolve();

  process.exit(1);
}

async function triggerOrderEvents() {
  const db = getDb();

  const orders = db.collection('ordersV2') as CollRef<RawFirestoreOrder>;

  const ordersStream = streamQueryWithRef(orders);

  const batch = new BatchHandler();
  for await (const item of ordersStream) {
    console.log(item.ref.path);
    await batch.deleteAsync(item.ref);
  }

  await batch.flush();

  console.log('deleted');

  // const batchHandler = new BatchHandler();
  // const statusEvents = db.collectionGroup('orderStatusChanges');
  // const statusStream = streamQueryWithRef(statusEvents);
  // for await (const item of statusStream) {
  //   await batchHandler.deleteAsync(item.ref);
  // }

  const orderEvents = db.collectionGroup('orderEvents') as CollGroupRef<OrderEvents>;

  const orderEventsStream = streamQueryWithRef(orderEvents);
  for await (const item of orderEventsStream) {
    console.log(item.ref.path);
    const update: Pick<OrderEvents, 'metadata'> = {
      metadata: {
        ...item.data.metadata,
        processed: false,
        updatedAt: Date.now()
      }
    };
    await batch.addAsync(item.ref, update, { merge: true });
  }

  await batch.flush();
  console.log('complete');

  // for await (const { data, ref } of ordersStream) {
  //   console.log(`Checking ${ref.id}`);
  //   const endTime = data.order?.endTimeMs;
  //   if (endTime && endTime < Date.now() && data.order?.status === 'active') {
  //     console.log(`Found expired order with status active: ${ref.id}`);
  //   }
  // }

  // // for await (const item of query) {
  // const item = await db.collection('ordersV2').doc(id).get();
  // pQueue
  //   .add(async () => {
  //     const batchHandler = new BatchHandler();

  //     console.log(`Processing: ${item.ref.id}`);

  //     await batchHandler.deleteAsync(item.ref);
  //     const orderEvents = item.ref.collection('orderEvents') as CollRef<OrderEvents>;
  //     const stream = streamQueryWithRef(orderEvents);
  //     for await (const item of stream) {
  //       await batchHandler.deleteAsync(item.ref);
  //     }

  //     const orderStatusEvents = item.ref.collection('orderStatusChanges') as CollRef<OrderStatusEvent>;
  //     const statusStream = streamQueryWithRef(orderStatusEvents);
  //     for await (const item of statusStream) {
  //       await batchHandler.deleteAsync(item.ref);
  //     }

  //     const reservoirOrderEvents = item.ref.collection('reservoirOrderEvents') as CollRef<ReservoirOrderEvent>;

  //     const orderEventQuery = reservoirOrderEvents
  //       .where('metadata.processed', '==', true)
  //       .orderBy('metadata.updatedAt', 'asc');

  //     const orderEventStream = streamQueryWithRef(orderEventQuery);
  //     for await (const orderEvent of orderEventStream) {
  //       const update: Pick<ReservoirOrderEvent, 'metadata'> = {
  //         metadata: {
  //           ...orderEvent.data.metadata,
  //           processed: false,
  //           updatedAt: Date.now()
  //         }
  //       };
  //       // await batchHandler.addAsync(orderEvent.ref, update, { merge: true });
  //       await batchHandler.deleteAsync(orderEvent.ref);
  //     }

  //     await batchHandler.flush();
  //   })
  //   .catch((err) => {
  //     console.error(err);
  //   });
  // // }

  // console.log('Waiting for queue to finish');
  // await pQueue.onIdle();
  // console.log(`Done`);
}

async function deleteInvalidOrders(validCollections: Set<string>) {
  const db = getDb();
  const ordersStream = streamQueryWithRef(db.collection('ordersV2') as CollRef<RawFirestoreOrder>);

  const queue = new PQueue({ concurrency: 10 });

  for await (const { data, ref } of ordersStream) {
    if ('rawOrder' in data && data.rawOrder) {
      if ('rawOrder' in data.rawOrder) {
        const nfts = data.rawOrder.infinityOrder.nfts;
        if (data.metadata.source !== 'infinity' && !nfts.find((item) => validCollections.has(item.collection))) {
          const isSellOrder = data.rawOrder.isSellOrder;
          // Delete
          queue
            .add(async () => {
              const batch = new BatchHandler();
              const provider = getProvider(data.metadata.chainId);
              const gasSimulator = new GasSimulator(provider, config.orderbook.gasSimulationAccount);
              console.log(`Found invalid order: ${ref.id}`);
              const baseOrder = new BaseOrder(
                data.metadata.id,
                data.metadata.chainId,
                isSellOrder,
                db,
                provider,
                gasSimulator
              );
              const order = await baseOrder.load();

              const refs = baseOrder.getDisplayRefs(order.displayOrder);
              for (const displayRef of refs) {
                if (displayRef) {
                  await batch.deleteAsync(displayRef);
                }
              }
              await db.recursiveDelete(ref);

              await batch.flush();
            })
            .catch((err) => {
              console.error(`Failed to delete ${ref.id}`, err);
            });
        }
      }
    }
  }

  await queue.onIdle();
}

void main();
