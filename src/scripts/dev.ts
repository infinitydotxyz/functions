import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { CollRef, Query, QuerySnap } from '@/firestore/types';

import { Reservoir } from '../lib';

class Dev extends ReservoirOrderStatusEventProcessor {
  async process(
    eventsSnap: QuerySnap<Reservoir.OrderEvents.Types.FirestoreOrderEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Reservoir.OrderEvents.Types.FirestoreOrderEvent>
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
    .doc('0x03c4d159856bcf000d75c8c22d46072cbe6f3f2fa1d896524eb717004ee0505a')
    .collection('orderStatusEvents') as CollRef<Reservoir.OrderEvents.Types.FirestoreOrderEvent>;
  const query = eventsRef
    .where('metadata.processed', '==', false)
    .where('metadata.updatedAt', '<', start)
    .limit(100) as Query<Reservoir.OrderEvents.Types.FirestoreOrderEvent>;

  const snap = await query.get();

  await db.runTransaction(async (txn) => {
    await processor.process(snap, txn, eventsRef);
  });
}

void main();
