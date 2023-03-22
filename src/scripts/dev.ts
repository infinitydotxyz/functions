import { ReservoirOrderStatusEventProcessor } from 'functions/reservoir/reservoir-order-event-processor';

import { ChainId, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { ONE_MIN } from '@infinityxyz/lib/utils';
import { Flow, SeaportV14 } from '@reservoir0x/sdk';

import { getDb } from '@/firestore/db';
import { CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getOrderStatus } from '@/lib/orderbook/indexer/validate-orders';
import { GasSimulator } from '@/lib/orderbook/order';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { OrderUpdater } from '@/lib/orderbook/order/order-updater';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { config } from '../config';

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
  const db = getDb();
  const orderRef = db
    .collection('ordersV2')
    .doc('0x0bb6725653c511192524d2878b854c5ad8356298f14fa4139736f6e74572e89e') as DocRef<RawFirestoreOrderWithoutError>;

  const orderSnap = await orderRef.get();
  const orderData = orderSnap.data();
  if (!orderData) {
    throw new Error('Order not found!');
  }
  const chainId = orderData?.metadata.chainId;
  const chainIdInt = parseInt(chainId, 10);
  const rawOrder = orderData?.rawOrder.rawOrder;
  // const order = new Flow.Order(parseInt(chainId, 10), rawOrder as Flow.Types.SignedOrder);

  const order = new SeaportV14.Order(chainIdInt, rawOrder as SeaportV14.Types.OrderComponents);
  const exchange = new SeaportV14.Exchange(chainIdInt);
  const taker = '0xbd9573b68297E6F0E01c4D64D6faED7c737024b5';

  const builder = new SeaportV14.Builders.SingleToken(chainIdInt);
  const matchParams = builder.buildMatching(order);

  const tx = await exchange.fillOrderTx(taker, order, matchParams);

  const provider = getProvider(chainId);
  const gasSimulator = new GasSimulator(provider, taker);

  const res = await gasSimulator.simulate(tx);

  console.log(`Gas usage: ${res}`);

  const baseOrder = new BaseOrder(
    orderData.metadata.id,
    orderData.metadata.chainId,
    orderData.order.isSellOrder,
    db,
    provider,
    gasSimulator
  );

  const gasUsage = await baseOrder.getGasUsage(orderData);
  const { displayOrder } = await baseOrder.load();

  const orderUpdater = new OrderUpdater(orderData, displayOrder);

  const initialGasUsage = orderData.order.gasUsage;

  console.log(`Initial gas usage ${initialGasUsage}`);

  orderUpdater.setGasUsage(gasUsage);

  console.log(`Updated gas usage ${orderUpdater.rawOrder.order.gasUsage}`);
}
void main();
