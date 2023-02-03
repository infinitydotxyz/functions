import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { Firestore } from '../../firestore/types';
import * as Reservoir from '../../lib/reservoir';

/**
 * a wrapper function to handle syncing multiple chains and order type events
 * at once
 *
 * note: if we are unable to handle the required throughput we can separate
 * these into separate processes to improve scalability
 */
export async function syncOrderEvents(
  db: Firestore,
  maxDuration: number,
  options?: { pollInterval?: number; startTimestamp?: number; delay?: number }
) {
  const start = Date.now();
  const stop = start + maxDuration;
  const pollInterval = options?.pollInterval ?? 15 * 1000;

  console.log(`Loading supported collections...`);
  const supportedColls = await db
    .collection(firestoreConstants.SUPPORTED_COLLECTIONS_COLL)
    .where('isSupported', '==', true)
    .select('isSupported')
    .limit(1000) // future todo: change limit if number of selected colls grow
    .get();
  const supportedCollsSet = new Set(supportedColls.docs.map((doc) => doc.id));
  console.log(`Loaded ${supportedCollsSet.size} supported collections.`);
  if (supportedCollsSet.size === 1000) {
    console.warn(`WARNING: 1000 supported collections loaded. Increase limit`);
  }
  const syncs = await Reservoir.OrderEvents.SyncMetadata.getSyncMetadata(db);
  await Promise.all(
    syncs.map(async (syncMetadata) => {
      try {
        const syncIterator = Reservoir.OrderEvents.sync(
          db,
          syncMetadata,
          450,
          supportedCollsSet,
          options?.startTimestamp
        );
        for await (const pageDetails of syncIterator) {
          console.log(
            `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Found ${pageDetails.numEventsFound} Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`
          );
          if (Date.now() > stop) {
            return;
          }
          if (pageDetails.numEventsFound < pageDetails.pageSize) {
            await sleep(pollInterval);
            if (Date.now() > stop) {
              return;
            }
          } else if (options?.delay) {
            await sleep(options.delay);
          }
        }
      } catch (err) {
        console.error(
          `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
            syncMetadata.data.metadata.collection ?? ''
          }`,
          err
        );
      }
    })
  );
}
