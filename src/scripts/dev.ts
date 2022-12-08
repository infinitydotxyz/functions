import { OrderEventProcessor } from 'functions/orderbook/order-event-processor';
import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { CollRef, Query, QuerySnap } from '@/firestore/types';
import { OrderEvents } from '@/lib/orderbook/order';
import { getProvider } from '@/lib/utils/ethersUtils';

import { Reservoir } from '../lib';

async function reservoirOrderProcessor(id: string) {
  class Dev extends ReservoirOrderStatusEventProcessor {
    async process(
      eventsSnap: QuerySnap<Reservoir.OrderEvents.Types.ReservoirOrderEvent>,
      txn: FirebaseFirestore.Transaction,
      eventsRef: CollRef<Reservoir.OrderEvents.Types.ReservoirOrderEvent>
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
    .collection('reservoirOrderEvents') as CollRef<Reservoir.OrderEvents.Types.ReservoirOrderEvent>;
  const query = eventsRef
    .where('metadata.processed', '==', false)
    .where('metadata.updatedAt', '<', start)
    .limit(100) as Query<Reservoir.OrderEvents.Types.ReservoirOrderEvent>;

  const snap = await query.get();

  await db.runTransaction(async (txn) => {
    await processor.process(snap, txn, eventsRef);
  });
}

async function orderEventProcessor(id: string) {
  class Dev extends OrderEventProcessor {
    async process(
      eventsSnap: QuerySnap<OrderEvents.Types.OrderEvents>,
      txn: FirebaseFirestore.Transaction,
      eventsRef: CollRef<OrderEvents.Types.OrderEvents>
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
  const eventsRef = db
    .collection('ordersV2')
    .doc(id)
    .collection('orderEvents') as CollRef<OrderEvents.Types.OrderEvents>;
  const query = eventsRef
    .where('metadata.processed', '==', false)
    .where('metadata.updatedAt', '<', start)
    .limit(100) as Query<OrderEvents.Types.OrderEvents>;

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(query);

    console.log(`Found" ${snap.docs.length} events`);
    await processor.process(snap, txn, eventsRef);
  });
}

async function main() {
  // const id = '0x17fdbd8f70b0a7b7f42d47d5ef7e81b2a92e0f59919b248ee17629660788187a';

  // await getDb().collection('ordersV2').doc(id).delete();
  // await reservoirOrderProcessor(id);
  // await orderEventProcessor(id);
  const hash = '0xe0ba7ce82546b9bf3f5a5a8e8abb6042df0e42ab288729fd7f07ec4af4d14618';

  class Dev extends OrderEventProcessor {
    async handleEvent(hash: string) {
      const res = await this._getSaleOrderHashes(hash, ChainId.Mainnet, getProvider(ChainId.Mainnet)!);
      console.log([...res]);
    }
  }

  const item = new Dev(
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

  await item.handleEvent(hash);
}

void main();
