import { Job, Queue } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import 'module-alias/register';
import { nanoid } from 'nanoid';
import PQueue from 'p-queue';

import {
  ChainId,
  EventType,
  FeedEvent,
  FirestoreDisplayOrder,
  OrderEvents,
  OrderSource,
  RawFirestoreOrder
} from '@infinityxyz/lib/types/core';
import { CollectionDto } from '@infinityxyz/lib/types/dto';
import { ONE_DAY, firestoreConstants, getExchangeAddress } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef, DocRef, DocSnap } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { getComponentLogger } from '@/lib/logger';
import { ContractEvent } from '@/lib/on-chain-events/types';
import { WithTiming } from '@/lib/process/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';

import { SnapshotMetadata } from '../../functions/orderbook/snapshot';
import { FirestoreDeletionProcess, JobData } from './process';

type Logger = ReturnType<typeof getComponentLogger>;

export default async function (job: Job<JobData>) {
  const start = Date.now();

  const process = new FirestoreDeletionProcess(redis, { concurrency: 0 });
  const logger = getComponentLogger(job.data.type);
  switch (job.data.type) {
    case 'search-collections': {
      await findCollectionsToPurge(logger, process.queue);
      break;
    }

    case 'purge-collection': {
      await purgeCollection(logger, { address: job.data.address, chainId: job.data.chainId });
      break;
    }

    case 'purge-order-snapshots': {
      await purgeOrderSnapshots(logger);
      break;
    }

    case 'trigger-purge-contract-events': {
      await triggerPurgeContractEvents(logger, process.queue);
      break;
    }

    case 'purge-contract-events': {
      await purgeContractEvents(logger, { address: job.data.address, chainId: job.data.chainId });
      break;
    }

    case 'purge-feed-events': {
      await purgeFeedEvents(logger, job.data.eventType);
      break;
    }

    case 'trigger-check-orders': {
      await triggerCheckOrders(logger, process.queue);
      break;
    }

    case 'check-order-batch': {
      await checkOrderBatch(logger, process.queue, job.data.orders);
      break;
    }

    case 'purge-order': {
      await purgeOrder(logger, job.data.orderId);
      break;
    }
  }

  await process.close();
  const end = Date.now();
  return {
    timing: {
      created: job.timestamp,
      started: start,
      completed: end
    }
  };
}

async function purgeCollection(logger: Logger, collection: { address: string; chainId: ChainId }) {
  const db = getDb();
  try {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      try {
        const collectionRef = db
          .collection('collections')
          .doc(`${collection.chainId}:${collection.address}`) as DocRef<CollectionDto>;

        const snap = await collectionRef.get();
        const data = snap.data() as any;

        if (data && 'isSupported' in data && data.isSupported) {
          logger.log(`Collection ${collection.chainId}:${collection.address} - Skipping`);
          return;
        }
        const subCollections = await collectionRef.listCollections();

        for (const subCollection of subCollections) {
          logger.log(`Collection ${collection.chainId}:${collection.address} - Deleting ${subCollection.id}`);
          await db.recursiveDelete(subCollection);
          logger.log(`Collection ${collection.chainId}:${collection.address} - Deleted ${subCollection.id}`);
        }
        return;
      } catch (err) {
        if (attempt > 5) {
          throw err;
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to purge collection ${collection.chainId}:${collection.address} ${err}`);
  }
}

async function findCollectionsToPurge(logger: Logger, queue: Queue<JobData, WithTiming<void>, string>) {
  const db = getDb();
  const collectionsRef = db.collection('collections') as CollRef<CollectionDto>;
  const start = Date.now();
  let loadedAt = 0;

  let hasLoaded = false;
  let documentsProcessed = 0;
  let totalDocuments = 0;
  const interval = setInterval(() => {
    if (hasLoaded) {
      const duration = loadedAt - start;
      const durationInSeconds = duration / 1000;
      const durationInMin = Math.floor((durationInSeconds / 60) * 100) / 100;
      logger.log(
        `Loaded documents in ${durationInMin}min - ${documentsProcessed}/${totalDocuments} collections processed`
      );
    } else {
      const duration = Date.now() - start;
      const durationInSeconds = duration / 1000;
      const durationInMin = Math.floor((durationInSeconds / 60) * 100) / 100;
      logger.log(`Loading documents... ${durationInMin}min`);
    }
  }, 10_000);
  try {
    const supportedCollections = new SupportedCollectionsProvider(db);
    await supportedCollections.init();
    const documents = await collectionsRef.listDocuments();
    hasLoaded = true;
    loadedAt = Date.now();
    totalDocuments = documents.length;

    const pqueue = new PQueue({ concurrency: 64 });
    for (const document of documents) {
      pqueue
        .add(async () => {
          let documentAttempts = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            documentAttempts += 1;
            try {
              const [chainId, address] = document.id.split(':');
              if (supportedCollections.has(document.id)) {
                // skip supported collections
                documentsProcessed += 1;
                return;
              }

              // trigger the collection to be purged
              await queue.add(`${document.path}`, {
                id: `${document.path}`,
                type: 'purge-collection',
                chainId: chainId as ChainId,
                address: address
              });
              documentsProcessed += 1;
              return;
            } catch (err) {
              if (documentAttempts > 5) {
                documentsProcessed += 1;
                throw err;
              }
            }
          }
        })
        .catch((err) => {
          logger.warn(`Failed to process collection ${document.id} ${err}`);
        });
    }

    await pqueue.onIdle();
  } catch (err) {
    logger.error(`Failed to process collections ${err}`);
  }

  clearInterval(interval);
}

async function purgeOrderSnapshots(logger: Logger) {
  const db = getDb();

  try {
    const orderSnapshotsRef = db.collection('orderSnapshots') as CollRef<SnapshotMetadata>;
    const expiredTimestamp = Date.now() - 32 * ONE_DAY;
    const expiredSnapshots = await orderSnapshotsRef.where('timestamp', '<', expiredTimestamp).get();
    const batch = new BatchHandler(100);
    for (const item of expiredSnapshots.docs) {
      logger.log(`Deleting snapshot ${item.id}`);
      await batch.deleteAsync(item.ref);
    }
    await batch.flush();
  } catch (err) {
    logger.error(`Failed to purge order snapshots ${err}`);
  }
}

async function triggerPurgeContractEvents(logger: Logger, queue: Queue<JobData, WithTiming<void>, string>) {
  const db = getDb();
  logger.log(`Triggering purge contract events`);
  const documents = await db.collection('contractStates').listDocuments();
  logger.log(`Found ${documents.length} contract states to purge`);
  const mainnetExchangeAddress = getExchangeAddress(ChainId.Mainnet);
  const goerliExchangeAddress = getExchangeAddress(ChainId.Goerli);
  const excludedAddresses = new Set([mainnetExchangeAddress, goerliExchangeAddress]);

  let count = 0;
  let index = 0;
  for (const doc of documents) {
    index += 1;
    const [chainId, address] = doc.id.split(':');
    if (excludedAddresses.has(address)) {
      logger.log(`Skipping ${doc.id} - excluded address`);
    } else {
      await queue.add(`${doc.path}`, {
        id: `${doc.path}`,
        type: 'purge-contract-events',
        chainId: chainId as ChainId,
        address: address
      });
      count += 1;

      if (count % 100 === 0) {
        logger.log(`Triggered ${count} purge contract events - ${index}/${documents.length} processed`);
      }
    }
  }

  logger.log(`Completed triggering purging of contract events. Triggered ${count} contracts`);
}

async function purgeContractEvents(logger: Logger, contract: { address: string; chainId: ChainId }) {
  const db = getDb();

  logger.log(`Purging contract events for ${contract.chainId}:${contract.address}`);

  const eventsRef = db
    .collection('contractStates')
    .doc(`${contract.chainId}:${contract.address}`)
    .collection('contractEvents') as CollRef<ContractEvent<unknown>>;

  // purge events older than 31 days
  const expiredTimestamp = Date.now() - 31 * ONE_DAY;
  const expiredTimestampSeconds = Math.floor(expiredTimestamp / 1000);

  const expiredEventsQuery = eventsRef
    .where('baseParams.blockTimestamp', '<', expiredTimestampSeconds)
    .orderBy('baseParams.blockTimestamp', 'asc')
    .orderBy(FieldPath.documentId(), 'asc');

  const stream = streamQueryWithRef(expiredEventsQuery, (item, ref) => [item.baseParams.blockTimestamp, ref.id]);

  const batch = new BatchHandler(100);
  let count = 0;
  for await (const { ref } of stream) {
    count += 1;
    await batch.deleteAsync(ref);
    if (count % 100 === 0) {
      logger.log(`Deleted ${count} contract events for ${contract.chainId}:${contract.address}`);
    }
  }
  logger.log(`Completed! Deleted ${count} contract events for ${contract.chainId}:${contract.address}`);
  await batch.flush();
}

async function purgeFeedEvents(logger: Logger, eventType: EventType) {
  const db = getDb();
  const feed = db.collection('feed') as CollRef<FeedEvent>;

  const expiredTimestamp = Date.now() - 31 * ONE_DAY;

  const events = feed
    .where('type', '==', eventType)
    .where('timestamp', '<', expiredTimestamp)
    .orderBy('timestamp', 'asc')
    .orderBy(FieldPath.documentId(), 'asc');

  const eventsStream = streamQueryWithRef(events, (item, ref) => [item.timestamp, ref.id]);

  const batch = new BatchHandler(100);
  let count = 0;
  for await (const { ref } of eventsStream) {
    count += 1;
    await batch.deleteAsync(ref);
    if (count % 100 === 0) {
      logger.log(`Deleted ${count} ${eventType} from feed`);
    }
  }

  await batch.flush();

  logger.log(`Completed! Deleted ${count} ${eventType} from feed`);
}

async function* streamOrders(logger: Logger) {
  const db = getDb();
  // this collection only contains a single document so we don't need to filter duplicates
  const reservoirOrderEventsTrigger = db.collectionGroup('_reservoirOrderEvents') as CollGroupRef<unknown>;

  let lastPathProcessed = '';

  while (true) {
    const query = lastPathProcessed
      ? reservoirOrderEventsTrigger.orderBy(FieldPath.documentId()).startAfter(lastPathProcessed)
      : reservoirOrderEventsTrigger.orderBy(FieldPath.documentId());

    try {
      for await (const item of query.stream()) {
        const snap = item as unknown as DocSnap<unknown>;
        const orderRef = snap.ref.parent.parent as DocRef<RawFirestoreOrder>;
        lastPathProcessed = snap.ref.path;
        if (orderRef) {
          yield { orderRef };
        }
      }
      /// completed
      logger.log(`Completed streaming orders!`);
      return;
    } catch (err) {
      logger.warn(`Received error while streaming orders. Continuing from last successful item. Error: ${err}`);
    }
  }
}

async function checkOrderBatch(logger: Logger, queue: Queue<JobData>, orders: string[]) {
  const start = Date.now();
  const db = getDb();
  const expiredTimestamp = Date.now() - 31 * ONE_DAY;

  const ordersCollectionRef = db.collection('ordersV2') as CollRef<RawFirestoreOrder>;
  const orderRefs = orders.map((orderId) => ordersCollectionRef.doc(orderId));
  const orderSnaps = await db.getAll(...orderRefs);

  let ordersTriggered = 0;
  let flowOrders = 0;
  const checkShouldPurge = async (orderRef: DocRef<RawFirestoreOrder>) => {
    const orderEventsRef = orderRef.collection('orderEvents') as CollRef<OrderEvents>;
    const recentOrderEventsSnap = await orderEventsRef
      .orderBy('metadata.timestamp', 'desc')
      .orderBy('metadata.id', 'desc')
      .limit(1)
      .get();
    const mostRecentOrderEventSnap = recentOrderEventsSnap.docs?.[0];

    if (mostRecentOrderEventSnap && mostRecentOrderEventSnap.exists) {
      const mostRecentOrderEvent = mostRecentOrderEventSnap.data();
      if (mostRecentOrderEvent && mostRecentOrderEvent.metadata.timestamp < expiredTimestamp) {
        return (
          mostRecentOrderEvent.data.status === 'expired' ||
          mostRecentOrderEvent.data.status === 'cancelled' ||
          mostRecentOrderEvent.data.status === 'filled'
        );
      }
      return false;
    }
    const reservoirOrderEventsRef = orderRef.collection('reservoirOrderEvents') as CollRef<ReservoirOrderEvent>;

    const mostRecentReservoirOrderEventsSnap = await reservoirOrderEventsRef
      .orderBy('metadata.id', 'desc')
      .limit(1)
      .get();
    const mostRecentReservoirOrderEventSnap = mostRecentReservoirOrderEventsSnap.docs?.[0];

    if (mostRecentReservoirOrderEventSnap && mostRecentReservoirOrderEventSnap.exists) {
      const mostRecentOrderEvent = mostRecentReservoirOrderEventSnap.data();
      if (mostRecentOrderEvent && mostRecentOrderEvent.metadata.updatedAt < expiredTimestamp) {
        return (
          mostRecentOrderEvent.metadata.status === 'expired' ||
          mostRecentOrderEvent.metadata.status === 'cancelled' ||
          mostRecentOrderEvent.metadata.status === 'filled'
        );
      }
      return false;
    }

    logger.log(`No order events found for ${orderRef.path}`);
    return true;
  };

  const pqueue = new PQueue({ concurrency: 20 });
  for (const snap of orderSnaps) {
    pqueue
      .add(async () => {
        const order = snap.data();
        if (!snap.exists || !order) {
          const shouldPurge = await checkShouldPurge(snap.ref as DocRef<RawFirestoreOrder>);
          if (shouldPurge) {
            /// purge
            await queue.add(`${snap.ref.path}`, {
              id: `${snap.ref.path}`,
              type: 'purge-order',
              orderId: snap.ref.id
            });
            ordersTriggered += 1;
          }
        } else if (order.metadata.source !== 'flow') {
          if ('order' in order && order?.order) {
            const isValid = order.order.isValid;
            const updatedAt = order.metadata.updatedAt;
            const isExpired = updatedAt < expiredTimestamp;
            if (!isValid && isExpired) {
              /// purge
              await queue.add(`${snap.ref.path}`, {
                id: `${snap.ref.path}`,
                type: 'purge-order',
                orderId: order.metadata.id
              });
              ordersTriggered += 1;
            }
          } else {
            const shouldPurge = await checkShouldPurge(snap.ref as DocRef<RawFirestoreOrder>);
            if (shouldPurge) {
              /// purge
              await queue.add(`${snap.ref.path}`, {
                id: `${snap.ref.path}`,
                type: 'purge-order',
                orderId: snap.ref.id
              });
              ordersTriggered += 1;
            }
          }
        } else {
          /// skip flow orders
          flowOrders += 1;
        }
      })
      .catch((err) => {
        logger.error(`Error while checking order ${snap.ref.path}. Error: ${err}`);
      });
  }

  await pqueue.onIdle();
  const duration = Date.now() - start;
  const seconds = Math.floor(duration / 10) / 100;
  logger.log(
    `Triggered ${ordersTriggered} orders of ${orders.length}. Found ${flowOrders} flow orders. Duration: ${seconds}sec`
  );
}

async function triggerCheckOrders(logger: Logger, queue: Queue<JobData>) {
  let processInterval: NodeJS.Timer | null = null;
  try {
    const processingStart = Date.now();
    let documents = 0;
    processInterval = setInterval(() => {
      const seconds = (Date.now() - processingStart) / 1000;
      const min = Math.floor((seconds / 60) * 100) / 100;
      logger.log(`Processed ${documents} orders... ${min}min`);
    }, 10_000);

    const stream = streamOrders(logger);

    let batch: string[] = [];

    for await (const { orderRef } of stream) {
      documents += 1;
      batch.push(orderRef.id);

      if (batch.length >= 200) {
        const id = nanoid();
        await queue.add(`${id}`, {
          id: `${id}`,
          type: 'check-order-batch',
          orders: batch
        });
        batch = [];
      }
    }

    if (batch.length > 0) {
      const id = nanoid();
      await queue.add(`${id}`, {
        id: `${id}`,
        type: 'check-order-batch',
        orders: batch
      });
    }

    clearInterval(processInterval);
    const seconds = (Date.now() - processingStart) / 1000;
    const min = Math.floor((seconds / 60) * 100) / 100;
    logger.log(`Processed ${documents} orders. ${min}min`);
  } catch (err) {
    if (processInterval) {
      clearInterval(processInterval);
    }
    logger.error(`Unexpected error ${err}`);
  }
}

async function purgeOrder(logger: Logger, orderId: string) {
  const db = getDb();

  logger.log(`Purging order ${orderId}...`);

  try {
    const orderRef = db.collection('ordersV2').doc(orderId) as DocRef<RawFirestoreOrder>;

    const orderSnap = await orderRef.get();
    const order = orderSnap.data();

    const batch = new BatchHandler(100);

    if (orderSnap.exists && order) {
      const chainOrderRef = db
        .collection('ordersV2ByChain')
        .doc(order.metadata.chainId)
        .collection('chainV2Orders')
        .doc(orderId) as DocRef<FirestoreDisplayOrder>;

      const displayOrderSnap = await chainOrderRef.get();
      const displayOrder = displayOrderSnap.data();

      if (displayOrder) {
        const displayRefs = getDisplayOrderRefs(
          db,
          displayOrder,
          orderId,
          order.metadata.chainId,
          order.metadata.source
        );
        for (const ref of displayRefs) {
          await batch.deleteAsync(ref);
        }
      }
    }

    await batch.flush();
    await db.recursiveDelete(orderRef);
    logger.log(`Purged order ${orderId}`);
  } catch (err) {
    logger.error(`Failed to purge order ${orderId} ${err}`);
  }
}

function getDisplayOrderRefs(
  db: FirebaseFirestore.Firestore,
  order: FirestoreDisplayOrder,
  orderId: string,
  chainId: ChainId,
  orderSource: OrderSource
): DocRef<FirestoreDisplayOrder>[] {
  const chainOrderRef = db
    .collection('ordersV2ByChain')
    .doc(order.metadata.chainId)
    .collection('chainV2Orders')
    .doc(orderId) as DocRef<FirestoreDisplayOrder>;
  const sourceOrderRef = db
    .collection('ordersV2BySource')
    .doc(orderSource)
    .collection('sourceV2Orders')
    .doc(orderId) as DocRef<FirestoreDisplayOrder>;

  const items =
    order.displayOrder?.kind === 'single-collection' ? [order.displayOrder?.item] : order.displayOrder?.items ?? [];

  const itemOrderRefs = items
    .filter((item) => !!item)
    .flatMap((item) => {
      const collectionRef = db.collection('collections').doc(`${chainId}:${item.address}`);
      const collectionOrderRef = collectionRef
        .collection('collectionV2Orders')
        .doc(orderId) as DocRef<FirestoreDisplayOrder>;

      switch (item.kind) {
        case 'single-token': {
          const tokenRef = collectionRef
            .collection('nfts')
            .doc(item.token.tokenId)
            .collection('tokenV2Orders')
            .doc(orderId) as DocRef<FirestoreDisplayOrder>;
          return [collectionOrderRef, tokenRef];
        }
        case 'token-list': {
          const tokenRefs = item.tokens.map((token) => {
            const tokenRef = collectionRef
              .collection('nfts')
              .doc(token.tokenId)
              .collection('tokenV2Orders')
              .doc(orderId) as DocRef<FirestoreDisplayOrder>;
            return tokenRef;
          });

          return [collectionOrderRef, ...tokenRefs];
        }
        case 'collection-wide': {
          const collectionWideOrderRef = collectionRef
            .collection('collectionWideV2Orders')
            .doc(orderId) as DocRef<FirestoreDisplayOrder>;
          return [collectionOrderRef, collectionWideOrderRef];
        }
        default: {
          throw new Error(`Unsupported order kind: ${(item as unknown as any)?.kind}`);
        }
      }
    });

  const maker = order?.order?.maker;
  const makerOrderRef = maker
    ? (db
        .collection(firestoreConstants.USERS_COLL)
        .doc(maker)
        .collection('makerV2Orders')
        .doc(orderId) as DocRef<FirestoreDisplayOrder>)
    : undefined;

  return [...itemOrderRefs, chainOrderRef, sourceOrderRef, makerOrderRef].filter(
    (item) => !!item
  ) as DocRef<FirestoreDisplayOrder>[];
}
