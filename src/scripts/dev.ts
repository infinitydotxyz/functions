import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
// import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';
import { syncOrderEvents } from 'functions/reservoir/sync-order-events';
import PQueue from 'p-queue';

import { ChainId, OrderDirection, OrderEvents, OrderStatusEvent, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { TriggerDoc } from '@/firestore/event-processors/types';
import { paginatedTransaction } from '@/firestore/paginated-transaction';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { ReservoirOrderBuilder } from '@/lib/orderbook/order/order-builder/reservoir-order-builder';
import * as Reservoir from '@/lib/reservoir';
import { SyncMetadata } from '@/lib/reservoir/order-events';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
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
  await triggerOrderEvents();
}

async function triggerOrderEvents() {
  const db = getDb();
  const orders = db.collection('ordersV2');

  const query = streamQueryWithRef(orders);

  const pQueue = new PQueue({
    concurrency: 10
  });

  for await (const item of query) {
    pQueue
      .add(async () => {
        console.log(`Processing: ${item.ref.id}`);
        const batchHandler = new BatchHandler();
        const orderEvents = item.ref.collection('orderEvents') as CollRef<OrderEvents>;

        const orderEventQuery = orderEvents
          .where('metadata.processed', '==', true)
          .orderBy('metadata.updatedAt', 'asc');

        const orderEventStream = streamQueryWithRef(orderEventQuery);
        for await (const orderEvent of orderEventStream) {
          const update: Pick<OrderEvents, 'metadata'> = {
            metadata: {
              ...orderEvent.data.metadata,
              processed: false,
              updatedAt: Date.now()
            }
          };
          await batchHandler.addAsync(orderEvent.ref, update, { merge: true });
        }

        await batchHandler.flush();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  console.log('Waiting for queue to finish');
  await pQueue.onIdle();
  console.log(`Done`);
}

void main();
