import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ChainId, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';
import { Flow } from '@reservoir0x/sdk';

import { getDb } from '@/firestore/db';
import { CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getOrderStatus } from '@/lib/orderbook/indexer/validate-orders';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';

// async function main() {
//   const id = '0xbd52880dfa27d21cc5f270f3311d513c281804df9e35eb48f3fbbcf407d5aab3';
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
//   const eventsRef = db
//     .collection('ordersV2')
//     .doc(id)
//     .collection('reservoirOrderEvents') as CollRef<ReservoirOrderEvent>;
//   const query = eventsRef
//     // .where('metadata.processed', '==', false)
//     // .where('metadata.updatedAt', '<', start)
//     .limit(100) as Query<ReservoirOrderEvent>;

//   const snap = await query.get();

//   await db.runTransaction(async (txn) => {
//     await processor.process(snap, txn, eventsRef);
//   });
// }

async function main() {
  const orderRef = getDb()
    .collection('ordersV2')
    .doc('0xf60d25c34974602bda4d363aaba3df7e2c0da52b32f7b04a57723ff23a2e911e') as DocRef<RawFirestoreOrderWithoutError>;

  const orderSnap = await orderRef.get();
  const orderData = orderSnap.data();
  const chainId = orderData?.metadata.chainId as ChainId;
  const rawOrder = orderData?.rawOrder.rawOrder;
  const order = new Flow.Order(parseInt(chainId, 10), rawOrder as Flow.Types.SignedOrder);
  const status = await getOrderStatus(order);
  console.log(status);
}
void main();
