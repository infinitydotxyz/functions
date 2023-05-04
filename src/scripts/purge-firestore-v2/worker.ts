import { Job, Queue } from 'bullmq';
import PQueue from 'p-queue';

import { ChainId } from '@infinityxyz/lib/types/core';
import { CollectionDto } from '@infinityxyz/lib/types/dto';

import { redis } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { CollRef } from '@/firestore/types';
import { getComponentLogger } from '@/lib/logger';
import { WithTiming } from '@/lib/process/types';

import { FirestoreDeletionProcess, JobData } from './process';

export default async function (job: Job<JobData>) {
  const start = Date.now();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 }).queue;
  const logger = getComponentLogger(job.data.type);
  switch (job.data.type) {
    case 'search-collections': {
      await findCollectionsToPurge(logger, queue);
    }

    case 'purge-collection': {
      await purgeCollection(job.data.chainId, job.data.address);
    }
  }
  const end = Date.now();
  return {
    timing: {
      created: job.timestamp,
      started: start,
      completed: end
    }
  };
}

async function findCollectionsToPurge(
  logger: ReturnType<typeof getComponentLogger>,
  queue: Queue<JobData, WithTiming<void>, string>
) {
  const db = getDb();
  const collectionsRef = db.collection('collections') as CollRef<CollectionDto>;

  const interval = setInterval(() => {}, 10_000);
  try {
    const documents = await collectionsRef.listDocuments();
    const pqueue = new PQueue({ concurrency: 50 });
    for (const document of documents) {
      pqueue
        .add(async () => {
          let documentAttempts = 0;
          while (true) {
            documentAttempts += 1;
            try {
              const snap = await document.get();
              const data = snap.data();
              if (!snap.exists || !data) {
                let [chainId, address] = document.id.split(':');
                await queue.add(`${document.path}`, {
                  id: `${document.path}`,
                  type: 'purge-collection',
                  chainId: chainId as ChainId,
                  address: address
                });
                return;
              }

              // TODO the collection document is not empty

              return;
            } catch (err) {
              if (documentAttempts > 5) {
                throw err;
              }
            }
          }
        })
        .catch((err) => {
          logger.warn(`Failed to process collection ${document.id} ${err}`);
        });
    }
  } catch (err) {}

  clearInterval(interval);
}
