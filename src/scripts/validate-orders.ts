import 'module-alias/register';

import { ChainId } from '@infinityxyz/lib/types/core';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { ValidateOrdersProcessor } from '@/lib/orderbook/process/validate-orders/validate-orders';

async function main() {
  const db = getDb();
  const isSellOrder = true;

  const id = `validate-orders:${isSellOrder}:`;
  const processor = new ValidateOrdersProcessor(id, redis, db, {
    enableMetrics: false,
    concurrency: 8,
    debug: true,
    attempts: 1,
    delay: 0
  });

  const numQueries = 16;

  const jobs = [];
  for (let queryNum = 0; queryNum < numQueries; queryNum++) {
    const jobData = {
      id: `${queryNum}`,
      queryNum,
      isSellOrder,
      concurrentReservoirRequests: 5,
      chainId: ChainId.Mainnet,
      numQueries
    };
    jobs.push(jobData);
  }

  await processor.add(jobs);

  await processor.run();

  // const checkpointFile = resolve(`sync/validate-orders-${config.isDev ? 'dev' : 'prod'}.txt`);
  // const checkpoints: string[] = [];

  // const data = await readFile(checkpointFile, 'utf8');
  // const lines = data.split('\n');
  // const firstLine = Number(lines?.[0]);
  // if (firstLine && firstLine === concurrency) {
  //   checkpoints.push(...lines.slice(1));
  // }

  // const saveCheckpoint = async (ref: DocRef<RawFirestoreOrder>, index: number) => {
  //   checkpoints[index] = ref.path;
  //   const data = `${concurrency}\n${checkpoints.join('\n')}`;
  //   await writeFile(checkpointFile, data);
  // };

  // const validSells = db
  //   .collection(firestoreConstants.ORDERS_V2_COLL)
  //   .where('order.isValid', '==', true)
  //   .where('order.isSellOrder', '==', isSellOrder) as Query<RawFirestoreOrder>;

  // const snap = await validSells.count().get();
  // const total = snap.data()?.count;

  // const splitQuery = (max: BigNumber, num: number) => {
  //   const queries = [];
  //   const len = max.toHexString().length;
  //   for (let i = 0; i < num; i++) {
  //     const start = max.mul(i).div(num).toHexString().padEnd(len, '0');
  //     const end = max
  //       .mul(i + 1)
  //       .div(num)
  //       .toHexString();

  //     queries.push(validSells.where('__name__', '>=', start).where('__name__', '<=', end));
  //   }
  //   return queries;
  // };

  // const queries = splitQuery(
  //   BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
  //   concurrency
  // );

  // const queue = new PQueue({ concurrency });
  // const pageQueue = new PQueue({ concurrency: 5 });

  // let numOrders = 0;

  // const start = Date.now();
  // setInterval(() => {
  //   console.log(
  //     `Processed ${numOrders} orders of ${total}. Rate: ${Math.floor(
  //       numOrders / ((Date.now() - start) / 1000)
  //     )} orders/s`
  //   );
  // }, 10_000);

  // let i = 0;
  // for (let query of queries) {
  //   const queryNum = i;
  //   const checkpoint = checkpoints[queryNum];
  //   if (checkpoint) {
  //     console.log(`Query: ${queryNum} Starting from checkpoint ${checkpoint}`);
  //     query = query.startAfter(db.doc(checkpoint));
  //   }
  //   i += 1;
  //   queue
  //     .add(async () => {
  //       const client = getClient(ChainId.Mainnet, config.reservoir.apiKey);
  //       const stream = streamQueryPageWithRef(query, undefined, { pageSize: 100 });

  //       for await (const page of stream) {
  //         pageQueue
  //           .add(async () => {
  //             const batchHandler = new BatchHandler();
  //             const itemById = new Map<string, { data: RawFirestoreOrder; ref: DocRef<RawFirestoreOrder> }>();
  //             for (const item of page) {
  //               itemById.set(item.data.metadata.id, item);
  //             }

  //             const ids = page.map((item) => item.data.metadata.id);

  //             try {
  //               const timestamp = Date.now();
  //               const method = isSellOrder
  //                 ? Reservoir.Api.Orders.AskOrders.getOrders
  //                 : Reservoir.Api.Orders.BidOrders.getOrders;
  //               const orders = await method(client, {
  //                 ids
  //               });
  //               let index = 0;

  //               for (const reservoirOrder of orders.data.orders) {
  //                 const item = itemById.get(reservoirOrder.id);
  //                 if (!item) {
  //                   throw new Error('Could not find item');
  //                 }

  //                 const status = reservoirOrder.status;
  //                 const itemStatus = item.data.order?.status;

  //                 if (status !== itemStatus) {
  //                   console.log(`${item.data.metadata.id} ${itemStatus} => ${status}`);
  //                   const orderEvent: OrderRevalidationEvent = {
  //                     metadata: {
  //                       id: `REVALIDATE:${timestamp}:${index}`,
  //                       isSellOrder: true,
  //                       orderId: item.data.metadata.id,
  //                       chainId: item.data.metadata.chainId,
  //                       processed: false,
  //                       migrationId: 1,
  //                       eventKind: OrderEventKind.Revalidation,
  //                       timestamp,
  //                       updatedAt: timestamp,
  //                       eventSource: 'infinity-orderbook'
  //                     },
  //                     data: {
  //                       status: status
  //                     }
  //                   };

  //                   const orderEventRef = item.ref.collection('orderEvents').doc(orderEvent.metadata.id);
  //                   await batchHandler.addAsync(orderEventRef, orderEvent, { merge: false });
  //                 }
  //                 index += 1;
  //               }
  //               await batchHandler.flush();
  //             } catch (err) {
  //               console.error(err);
  //             }

  //             const lastItem = page[page.length - 1];
  //             if (lastItem) {
  //               await saveCheckpoint(lastItem.ref, queryNum);
  //             }
  //             numOrders += page.length;
  //           })
  //           .catch((err) => {
  //             console.error(err);
  //           });
  //       }
  //     })
  //     .catch((err) => {
  //       console.error(err);
  //     });
  // }

  // console.log(`Waiting for all processes to complete`);
  // await queue.onIdle();
  // console.log(`Complete!`);
}

void main();
