import { constants } from 'ethers';
import PQueue from 'p-queue';

import {
  FirestoreDisplayOrder,
  OrderEventKind,
  OrderEvents,
  OrderStatusEvent,
  RawFirestoreOrder
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, getOBComplicationAddress } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { BaseOrder } from '@/lib/orderbook/order/base-order';
import { OrderUpdater } from '@/lib/orderbook/order/order-updater';
import { getProvider } from '@/lib/utils/ethersUtils';

import { config } from '../config';
import { Orderbook } from '../lib';

async function main() {
  const db = getDb();

  const ordersCollection = db.collection(firestoreConstants.ORDERS_V2_COLL) as CollRef<RawFirestoreOrder>;

  const stream = streamQueryWithRef(
    ordersCollection.where('order.isValid', '==', true).orderBy('__name__')
    // .startAfter('0x9f0ee0d6604f8bd12351e34eca91cca62b6075b41c05f9ebab311c882f62ed9b')
  );

  const supportedCollectionsProvider = new SupportedCollectionsProvider(db);
  await supportedCollectionsProvider.init();

  const queue = new PQueue({ concurrency: 50 });

  let numUpdated = 0;
  let numDeleted = 0;
  let numSkipped = 0;
  for await (const { data, ref } of stream) {
    queue
      .add(async () => {
        if ('order' in data && data.order) {
          const flowComplication = getOBComplicationAddress(data.metadata.chainId);
          const maker = data.order.maker;
          const complication = data.order.complication;
          const collection = data.order.collection;
          const id = `${data.metadata.chainId}:${collection}`;

          const isSupported = supportedCollectionsProvider.has(id);

          if (complication !== flowComplication || !isSupported) {
            const chainDisplayRef = db
              .collection('ordersV2ByChain')
              .doc(data.metadata.chainId)
              .collection('chainV2Orders')
              .doc(data.metadata.id) as DocRef<FirestoreDisplayOrder>;

            const displayOrderSnap = await chainDisplayRef.get();
            const displayOrder = displayOrderSnap.data();
            const provider = getProvider(data.metadata.chainId);
            if (displayOrder) {
              const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
              const baseOrder = new BaseOrder(
                data.metadata.id,
                data.metadata.chainId,
                data.order.isSellOrder,
                db,
                provider,
                gasSimulator
              );
              const orderUpdater = new OrderUpdater(data, displayOrder);

              if (maker === constants.AddressZero && isSupported) {
                numUpdated += 1;
                console.log(
                  `Updating match exec order: ${data.metadata.id} Chain: ${data.metadata.chainId} Maker: ${maker} Complication: ${complication} => ${flowComplication}`
                );
                orderUpdater.setComplication(flowComplication);
                // update complication
                await baseOrder.save(orderUpdater.rawOrder, orderUpdater.displayOrder);
                const orderStatusChangesRef = ref.collection('orderStatusChanges') as CollRef<OrderStatusEvent>;
                const stream = streamQueryWithRef(orderStatusChangesRef);
                const batch = new BatchHandler();
                for await (const { data, ref } of stream) {
                  data.order.execParams[0] = flowComplication;
                  await batch.addAsync(ref, data, { merge: true });
                }

                const orderEventsRef = ref.collection('orderEvents') as CollRef<OrderEvents>;
                const stream2 = streamQueryWithRef(
                  orderEventsRef.where('metadata.eventKind', '==', OrderEventKind.Created)
                );
                for await (const { data, ref } of stream2) {
                  if ('order' in data.data && 'infinityOrder' in data.data.order) {
                    data.data.order.infinityOrder.execParams[0] = flowComplication;
                    await batch.addAsync(ref, data, { merge: true });
                  }
                }
                await batch.flush();
              } else {
                numDeleted += 1;
                console.log(
                  `Deleting order: ${data.metadata.id} Chain: ${data.metadata.chainId} Is Supported ${
                    isSupported ? '✅' : '❌'
                  } Maker: ${maker} Complication: ${complication} Expected: ${flowComplication}`
                );
                await baseOrder.delete(displayOrder);

                const orderStatusChangesRef = ref.collection('orderStatusChanges') as CollRef<OrderStatusEvent>;
                const orderStatusEventsStream = streamQueryWithRef(orderStatusChangesRef);
                const batch = new BatchHandler();
                for await (const { ref } of orderStatusEventsStream) {
                  await batch.deleteAsync(ref);
                }

                /**
                 * note - we don't delete order events since those are used by reservoir for bulk order scraping
                 */
                if (data.metadata.source !== 'infinity' && data.metadata.source !== 'flow') {
                  const orderEventsRef = ref.collection('orderEvents') as CollRef<OrderEvents>;
                  const orderEventsStream = streamQueryWithRef(orderEventsRef);
                  for await (const { ref } of orderEventsStream) {
                    await batch.deleteAsync(ref);
                  }
                  const reservoirOrderEvents = ref.collection('reservoirOrderEvents') as CollRef<OrderEvents>;
                  const reservoirOrderEventsStream = streamQueryWithRef(reservoirOrderEvents);
                  for await (const { ref } of reservoirOrderEventsStream) {
                    await batch.deleteAsync(ref);
                  }
                }
                await batch.flush();
              }
            }
          } else {
            console.log(`Order: ${data.metadata.id} Chain: ${data.metadata.chainId} Already updated ${complication}`);
            numSkipped += 1;
          }
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }

  console.log(`Waiting for queue to finish...`);
  await queue.onIdle();
  console.log(`Queue finished. Updated: ${numUpdated} Deleted: ${numDeleted} Skipped: ${numSkipped}`);
}

void main();
