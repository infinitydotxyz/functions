import { sleep } from '@infinityxyz/lib/utils';

import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';

import * as Reservoir from '..';
import { DocRef, Firestore } from '../../../firestore/types';
import { SyncMetadata } from './types';

/**
 * a wrapper function to handle syncing multiple chains and order type events
 * at once
 *
 * note: if we are unable to handle the required throughput we can separate
 * these into separate processes to improve scalability
 */
export async function syncOrderEvents(
  db: Firestore,
  supportedCollections: SupportedCollectionsProvider,
  maxDuration: number | null,
  options?: { pollInterval?: number; startTimestamp?: number; delay?: number }
) {
  const start = Date.now();
  const stop = maxDuration != null ? start + maxDuration : null;
  const pollInterval = options?.pollInterval ?? 15 * 1000;
  const syncsRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);
  const syncsQuery = syncsRef.where('metadata.isPaused', '==', false);

  const syncs = new Map<string, { isRunning: boolean; promise: Promise<void> }>();

  const stopSync = (id: string) => {
    const sync = syncs.get(id);
    if (sync?.isRunning) {
      sync.isRunning = false;
    }
  };

  const runSync = async (
    syncMetadata: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
    checkAbort: () => { abort: boolean }
  ) => {
    while (checkAbort().abort === false) {
      try {
        const syncIterator = Reservoir.OrderEvents.sync(
          db,
          syncMetadata,
          450,
          supportedCollections,
          checkAbort,
          options?.startTimestamp
        );
        for await (const pageDetails of syncIterator) {
          logger.log(
            'sync-order-events',
            `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Found ${pageDetails.numEventsFound} Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`
          );
          if (stop != null && Date.now() > stop) {
            stopSync(syncMetadata.ref.id);
            return;
          }
          if (pageDetails.numEventsFound < pageDetails.pageSize) {
            await sleep(pollInterval);
          } else if (options?.delay) {
            await sleep(options.delay);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Abort')) {
          logger.warn(
            'sync-order-events',
            `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
              syncMetadata.data.metadata.collection ?? ''
            }`,
            err
          );
        } else if (err instanceof Error && err.message.includes('Paused')) {
          logger.warn(
            'sync-order-events',
            `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
              syncMetadata.data.metadata.collection ?? ''
            }`,
            err
          );
          return;
        } else {
          logger.error(
            'sync-order-events',
            `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
              syncMetadata.data.metadata.collection ?? ''
            }`,
            err
          );
          await sleep(pollInterval);
        }
      }
    }
  };

  const startSync = (item: { data: SyncMetadata; ref: DocRef<SyncMetadata> }) => {
    const existingSync = syncs.get(item.ref.id);

    if (existingSync?.isRunning) {
      return;
    }

    const checkAbort = () => {
      const sync = syncs.get(item.ref.id);
      if (!sync?.isRunning) {
        return { abort: true };
      }

      return { abort: false };
    };

    syncs.set(item.ref.id, {
      isRunning: true,
      promise: new Promise((resolve, reject) => {
        process.nextTick(() => {
          runSync(item, checkAbort).then(resolve).catch(reject);
        });
      })
    });
  };

  const cancelSnapshot = syncsQuery.onSnapshot(
    (snapshot) => {
      const changes = snapshot.docChanges();
      logger.log('sync-order-events', `Received: ${changes.length} document changes`);

      for (const item of changes) {
        const data = item.doc.data();
        switch (item.type) {
          case 'added': {
            startSync({ data, ref: item.doc.ref });
            break;
          }
          case 'removed': {
            stopSync(item.doc.ref.id);
            break;
          }
          case 'modified': {
            if (data.metadata.isPaused) {
              stopSync(item.doc.ref.id);
            }
          }
        }
      }
    },
    (err) => {
      logger.error('sync-order-events', `On Snapshot error: ${err}`);
    }
  );

  const cancel = async () => {
    cancelSnapshot();
    const promises: Promise<void>[] = [];
    for (const item of syncs.values()) {
      item.isRunning = false;
      promises.push(item.promise);
    }
    await Promise.allSettled(promises);
  };

  await Promise.resolve(cancel);
}
