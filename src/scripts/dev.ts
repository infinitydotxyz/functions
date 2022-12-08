import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { CollRef, Query, QuerySnap } from '@/firestore/types';

import { Reservoir } from '../lib';

class Dev extends ReservoirOrderStatusEventProcessor {
  async process(
    eventsSnap: QuerySnap<Reservoir.OrderEvents.Types.ReservoirOrderEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Reservoir.OrderEvents.Types.ReservoirOrderEvent>
  ) {
    await this._processEvents(eventsSnap, txn, eventsRef);
  }
}

async function main() {
  const processor = new Dev(
    {
      docBuilderCollectionPath: `ordersV2/{orderId}/orderStatusEvents`,
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
    .doc('0x00b97364e033ec517e975e60a77f055d3b60acef3fd53e24c19a861cc54bb7cf')
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

void main();
