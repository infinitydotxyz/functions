import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';
import { syncOrderEvents } from 'functions/reservoir/sync-order-events';

import { ChainId, OrderEvents } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { TriggerDoc } from '@/firestore/event-processors/types';
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
  const db = getDb();
  const stopIn = ONE_MIN * 8.75;
  await syncOrderEvents(db, stopIn, { pollInterval: 1000 * 10, delay: 5000 });
  // const id = '0x053589c285f3f65e11685830ade4f3a8217ffceeed2f356602d469fd252bddfc';
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

  // const db = getDb();
  // const result = await db
  //   .collectionGroup('_reservoirOrderEvents')
  //   .where('id', '==', '_trigger:reservoirOrderEvents:processor')
  //   .where('requiresProcessing', '==', true)
  //   .where('updatedAt', '<', Date.now())
  //   .limit(2)
  //   .get();

  // for (const item of result.docs) {
  //   console.log(item.ref.path);
  //   console.log(JSON.stringify(item.data(), null, 2));
  // }
}

void main();
