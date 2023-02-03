import { sleep } from '@infinityxyz/lib/utils';

import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

import * as Reservoir from '..';
import { Firestore } from '../../../firestore/types';

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

  const syncs = await Reservoir.OrderEvents.SyncMetadata.getSyncMetadata(db);
  await Promise.all(
    syncs.map(async (syncMetadata) => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const syncIterator = Reservoir.OrderEvents.sync(
            db,
            syncMetadata,
            450,
            supportedCollections,
            options?.startTimestamp
          );
          for await (const pageDetails of syncIterator) {
            console.log(
              `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Found ${pageDetails.numEventsFound} Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`
            );
            if (stop != null && Date.now() > stop) {
              return;
            }
            if (pageDetails.numEventsFound < pageDetails.pageSize) {
              await sleep(pollInterval);
              if (stop != null && Date.now() > stop) {
                return;
              }
            } else if (options?.delay) {
              await sleep(options.delay);
            }
          }
        } catch (err) {
          let log;
          if (err instanceof Error && err.message.includes('Sync paused')) {
            log = console.warn;
          } else {
            log = console.error;
          }
          log(
            `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
              syncMetadata.data.metadata.collection ?? ''
            }`,
            err
          );
          await sleep(pollInterval);
        }
      }
    })
  );
}
