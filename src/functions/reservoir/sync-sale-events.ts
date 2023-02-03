import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { Firestore } from '../../firestore/types';
import * as Reservoir from '../../lib/reservoir';

/**
 * a wrapper function to handle syncing multiple chains sales
 * at once
 *
 * note: if we are unable to handle the required throughput we can separate
 * these into separate processes to improve scalability
 */
export async function syncSaleEvents(
  db: Firestore,
  maxDuration: number,
  options?: { pollInterval?: number; delay?: number },
  stopAfterBackfill?: boolean
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

  const syncs = await Reservoir.Sales.SyncMetadata.getSyncMetadata(db);
  await Promise.all(
    syncs.map(async (syncMetadata) => {
      try {
        const syncIterator = Reservoir.Sales.sync(db, syncMetadata, supportedCollsSet);
        for await (const pageDetails of syncIterator) {
          console.log(
            `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Saved ${pageDetails.numItemsInPage} Page ${pageDetails.pageNumber}`
          );
          if (stopAfterBackfill) {
            console.log(
              `Backfill completed for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}`
            );
            return;
          }
          if (Date.now() > stop) {
            return;
          }
          await sleep(pollInterval);
          if (Date.now() > stop) {
            return;
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
