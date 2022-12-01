import { sleep } from '@infinityxyz/lib/utils';

import { Firestore } from '../../firestore/types';
import * as Reservoir from '../../reservoir';

export async function syncOrderEvents(db: Firestore, maxDuration: number, options?: { pollInterval?: number }) {
  const start = Date.now();
  const stop = start + maxDuration;
  const pollInterval = options?.pollInterval ?? 15 * 1000;

  const syncs = await Reservoir.OrderEvents.SyncMetadata.getSyncMetadata(db);
  await Promise.all(
    syncs.map(async (syncMetadata) => {
      const syncIterator = Reservoir.OrderEvents.sync(db, syncMetadata);
      for await (const pageDetails of syncIterator) {
        // console.log(`Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Found ${pageDetails.numEventsFound} Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`);
        if (Date.now() > stop) {
          return;
        }
        if (pageDetails.numEventsFound < pageDetails.pageSize) {
          await sleep(pollInterval);
          if (Date.now() > stop) {
            return;
          }
        }
      }
    })
  );
}
