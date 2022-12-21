import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';
import { syncOrderEvents } from 'functions/reservoir/sync-order-events';
import PQueue from 'p-queue';

import { ChainId, OrderDirection, OrderEvents } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { TriggerDoc } from '@/firestore/event-processors/types';
import { paginatedTransaction } from '@/firestore/paginated-transaction';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import * as Reservoir from '@/lib/reservoir';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

async function reservoirOrderProcessor(id: string) {
  class Dev extends ReservoirOrderStatusEventProcessor {
    async process(
      eventsSnap: QuerySnap<ReservoirOrderEvent>,
      txn: FirebaseFirestore.Transaction,
      eventsRef: CollRef<ReservoirOrderEvent>
    ) {
      await this._processEvents(eventsSnap, txn, eventsRef);
    }
  }

  const processor = new Dev(
    {
      docBuilderCollectionPath: `ordersV2/{orderId}/reservoirOrderEvents`,
      batchSize: 100,
      maxPages: 3,
      minTriggerInterval: ONE_MIN,
      id: 'merger'
    },
    {
      schedule: 'every 5 minutes',
      tts: ONE_MIN
    },
    getDb
  );

  const db = getDb();
  const start = Date.now();
  const eventsRef = db
    .collection('ordersV2')
    .doc(id)
    .collection('reservoirOrderEvents') as CollRef<ReservoirOrderEvent>;
  const query = eventsRef
    .where('metadata.processed', '==', false)
    .where('metadata.updatedAt', '<', start)
    .limit(100) as Query<ReservoirOrderEvent>;

  const snap = await query.get();

  await db.runTransaction(async (txn) => {
    await processor.process(snap, txn, eventsRef);
  });
}

async function orderEventProcessor(id: string) {
  class Dev extends OrderEventProcessor {
    async process(
      eventsSnap: QuerySnap<OrderEvents>,
      txn: FirebaseFirestore.Transaction,
      eventsRef: CollRef<OrderEvents>
    ) {
      await this._processEvents(eventsSnap, txn, eventsRef);
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
  const start = Date.now();
  const eventsRef = db.collection('ordersV2').doc(id).collection('orderEvents') as CollRef<OrderEvents>;
  const query = eventsRef
    .where('metadata.processed', '==', false)
    .where('metadata.updatedAt', '<', start)
    .limit(100) as Query<OrderEvents>;

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(query);

    await processor.process(snap, txn, eventsRef);
  });
}

async function main() {
  // const db = getDb();
  // const stopIn = ONE_MIN * 8.75;
  // await syncOrderEvents(db, stopIn, { pollInterval: 1000 * 10, delay: 5000 });
  // const id = '0x00080fc79268b013aa60d58c90aa611736698cb51c02c78a2c2ce6ee2f5ec090';
  // const db = getDb();
  // await Reservoir.OrderEvents.addSyncs(
  //   db,
  //   ChainId.Mainnet,
  //   ['collection-ask'],
  //   '0xea67b4dd7bacae340bc4e43652044b5cded1963c'
  // );
  // await getDb().collection('ordersV2').doc(id).delete();
  // await reservoirOrderProcessor(id);
  // await orderEventProcessor(id);
  await triggerOrderEvents();

  // class Dev extends OrderEventProcessor {
  //   async process(
  //     eventsSnap: QuerySnap<OrderEvents>,
  //     txn: FirebaseFirestore.Transaction,
  //     eventsRef: CollRef<OrderEvents>
  //   ) {
  //     await this._processEvents(eventsSnap, txn, eventsRef);
  //   }
  //   async getEventsForProcessing(ref: CollRef<OrderEvents>) {
  //     return super._getEventsForProcessing(ref);
  //   }

  //   async run() {
  //     const eventsRef = this._getDb()
  //       .collection('ordersV2')
  //       .doc('0x0002acdfd8e5b4b47861b64128c1543b4cbf811906387155e8039b0097de6929')
  //       .collection('orderEvents') as CollRef<OrderEvents>;
  //     const eventsForProcessing = await processor.getEventsForProcessing(eventsRef);

  //     const ref = eventsRef.parent?.collection('_orderEvents').doc(this._triggerDocId) as DocRef<TriggerDoc>;

  //     let wasMarked = false;
  //     const markAsProcessed = async (ref: DocRef<TriggerDoc>, txn?: FirebaseFirestore.Transaction) => {
  //       if (wasMarked) {
  //         return;
  //       }
  //       const update: Partial<TriggerDoc> = {
  //         requiresProcessing: false,
  //         lastProcessedAt: Date.now(),
  //         updatedAt: Date.now()
  //       };

  //       if (txn) {
  //         txn.set(ref, update, { merge: true });
  //       } else {
  //         await ref.set(update, { merge: true });
  //       }
  //       wasMarked = true;
  //     };

  //     let page = 0;
  //     const res = await paginatedTransaction(
  //       eventsForProcessing.query,
  //       this._getDb(),
  //       { pageSize: this._config.batchSize, maxPages: this._config.maxPages },
  //       async ({ data, txn, hasNextPage }) => {
  //         page += 1;
  //         console.log(`Processing page: ${page} hasNextPage: ${hasNextPage}`);
  //         data.docs.forEach((doc) => {
  //           console.log(`Processing doc: ${doc.ref.id}`);
  //         });

  //         await this._processEvents(data, txn, eventsRef);

  //         console.log(`Completed processing page: ${page} hasNextPage: ${hasNextPage}`);
  //         if (!hasNextPage) {
  //           console.log(`Marking as processed`);
  //           await markAsProcessed(ref, txn);
  //         }
  //       },
  //       eventsForProcessing.applyStartAfter
  //     );
  //   }
  // }

  // const processor = new Dev(
  //   {
  //     docBuilderCollectionPath: `ordersV2/{orderId}/orderEvents`,
  //     batchSize: 100,
  //     maxPages: 3,
  //     minTriggerInterval: ONE_MIN,
  //     id: 'processor'
  //   },
  //   {
  //     schedule: 'every 5 minutes',
  //     tts: ONE_MIN
  //   },
  //   getDb
  // );

  // await processor.run();
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
