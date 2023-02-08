import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { CollRef, Query, QuerySnap } from '@/firestore/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';

async function main() {
  const id = '0x00000f1151942a79ebf12cc6b93305802b4c61f008d1364498cef2015876e47e';
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

void main();
