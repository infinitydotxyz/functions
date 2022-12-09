import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ChainId, OrderEvents } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { CollRef, Query, QuerySnap } from '@/firestore/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { Reservoir } from '../lib';

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

    console.log(`Found" ${snap.docs.length} events`);
    await processor.process(snap, txn, eventsRef);
  });
}

async function main() {
  const id = '0x2a8ebfb65df446c052cb9b84e30cffed39cda3734d5b36a9f7a1f5a16be91f14';

  // await getDb().collection('ordersV2').doc(id).delete();
  // await reservoirOrderProcessor(id);
  await orderEventProcessor(id);
}

void main();
