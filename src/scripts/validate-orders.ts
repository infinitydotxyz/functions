import { readFile, writeFile } from 'fs/promises';
import PQueue from 'p-queue';
import { resolve } from 'path';

import { ChainId, OrderEventKind, OrderRevalidationEvent, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { DocRef, Query } from '@/firestore/types';
import { getClient } from '@/lib/reservoir/api';

import { config } from '../config';
import { Reservoir } from '../lib';

async function main() {
  const db = getDb();
  const isSellOrder = true;
  const checkpointFile = resolve(`sync/validate-orders-${config.isDev ? 'dev' : 'prod'}.txt`);
  const checkpoint = await readFile(checkpointFile, 'utf8');
  const saveCheckpoint = async (ref: DocRef<RawFirestoreOrder>) => {
    await writeFile(checkpointFile, ref.path);
  };

  let validSells = db
    .collection(firestoreConstants.ORDERS_V2_COLL)
    .where('order.isValid', '==', true)
    .where('order.isSellOrder', '==', isSellOrder) as Query<RawFirestoreOrder>;

  if (checkpoint) {
    validSells = validSells.startAfter(db.doc(checkpoint));
  }

  const stream = streamQueryPageWithRef(validSells, undefined, { pageSize: 100 });
  const queue = new PQueue({ concurrency: 10 });
  const client = getClient(ChainId.Mainnet, config.reservoir.apiKey);
  for await (const page of stream) {
    queue
      .add(async () => {
        const batchHandler = new BatchHandler();
        const itemById = new Map<string, { data: RawFirestoreOrder; ref: DocRef<RawFirestoreOrder> }>();
        for (const item of page) {
          itemById.set(item.data.metadata.id, item);
        }

        const ids = page.map((item) => item.data.metadata.id);

        try {
          const timestamp = Date.now();
          const method = isSellOrder
            ? Reservoir.Api.Orders.AskOrders.getOrders
            : Reservoir.Api.Orders.BidOrders.getOrders;
          const orders = await method(client, {
            ids
          });
          let index = 0;

          for (const reservoirOrder of orders.data.orders) {
            const item = itemById.get(reservoirOrder.id);
            if (!item) {
              throw new Error('Could not find item');
            }

            const status = reservoirOrder.status;
            const itemStatus = item.data.order?.status;

            if (status !== itemStatus) {
              console.log(`${item.data.metadata.id} ${itemStatus} => ${status}`);
              const orderEvent: OrderRevalidationEvent = {
                metadata: {
                  id: `REVALIDATE:${timestamp}:${index}`,
                  isSellOrder: true,
                  orderId: item.data.metadata.id,
                  chainId: item.data.metadata.chainId,
                  processed: false,
                  migrationId: 1,
                  eventKind: OrderEventKind.Revalidation,
                  timestamp,
                  updatedAt: timestamp,
                  eventSource: 'infinity-orderbook'
                },
                data: {
                  status: status
                }
              };

              const orderEventRef = item.ref.collection('orderEvents').doc(orderEvent.metadata.id);
              await batchHandler.addAsync(orderEventRef, orderEvent, { merge: false });
            }
            index += 1;
          }
          await batchHandler.flush();
        } catch (err) {
          console.error(err);
        }

        const lastItem = page[page.length - 1];
        if (lastItem) {
          await saveCheckpoint(lastItem.ref);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }
  console.log(`Waiting for all processes to complete`);
  await queue.onIdle();
  console.log(`Complete!`);
}

void main();
