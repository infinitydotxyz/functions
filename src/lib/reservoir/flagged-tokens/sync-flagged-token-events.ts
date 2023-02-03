import { sleep } from '@infinityxyz/lib/utils';

import * as Reservoir from '..';
import { Firestore } from '../../../firestore/types';

/**
 * a wrapper function to handle syncing multiple chains sales
 * at once
 *
 * note: if we are unable to handle the required throughput we can separate
 * these into separate processes to improve scalability
 */
export async function syncFlaggedTokenEvents(
  db: Firestore,
  maxDuration: number | null,
  options?: { pollInterval?: number; delay?: number }
) {
  const start = Date.now();
  const stop = maxDuration != null ? start + maxDuration : null;
  const pollInterval = options?.pollInterval ?? 15 * 1000;

  const syncs = await Reservoir.FlaggedTokens.SyncMetadata.getSyncMetadata(db);
  await Promise.all(
    syncs.map(async (syncMetadata) => {
      try {
        const syncIterator = Reservoir.FlaggedTokens.sync(db, syncMetadata);
        for await (const pageDetails of syncIterator) {
          console.log(
            `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Saved ${pageDetails.numItemsInPage} Page ${pageDetails.pageNumber}`
          );
          if (stop != null && Date.now() > stop) {
            return;
          }
          await sleep(pollInterval);
          if (stop != null && Date.now() > stop) {
            return;
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
          `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}`,
          err
        );
        await sleep(pollInterval);
      }
    })
  );
}
