import { Job, Queue } from 'bullmq';
import 'module-alias/register';
import PQueue from 'p-queue';

import { ChainId } from '@infinityxyz/lib/types/core';
import { CollectionDto } from '@infinityxyz/lib/types/dto';
import { ONE_DAY } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { CollRef, DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { getComponentLogger } from '@/lib/logger';
import { WithTiming } from '@/lib/process/types';

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

    const pqueue = new PQueue({ concurrency: 50 });
    for (const document of documents) {
      pqueue
        .add(async () => {
          let documentAttempts = 0;
          while (true) {
            documentAttempts += 1;
            try {
              let [chainId, address] = document.id.split(':');
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
    let batch = new BatchHandler(100);
    for (const item of expiredSnapshots.docs) {
      logger.log(`Deleting snapshot ${item.id}`);
      await batch.deleteAsync(item.ref);
    }
    await batch.flush();
  } catch (err) {
    logger.error(`Failed to purge order snapshots ${err}`);
  }
}
