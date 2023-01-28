// import { sleep } from '@infinityxyz/lib/utils';

// import { Firestore } from '../../firestore/types';
// import * as Reservoir from '../../lib/reservoir';

// /**
//  * a wrapper function to handle syncing multiple chains sales
//  * at once
//  *
//  * note: if we are unable to handle the required throughput we can separate
//  * these into separate processes to improve scalability
//  */
// export async function syncSaleEvents(
//   db: Firestore,
//   maxDuration: number,
//   options?: { pollInterval?: number; delay?: number }
// ) {
//   const start = Date.now();
//   const stop = start + maxDuration;
//   const pollInterval = options?.pollInterval ?? 15 * 1000;

//   const syncs = await Reservoir.Sales.SyncMetadata.getSyncMetadata(db);
//   await Promise.all(
//     syncs.map(async (syncMetadata) => {
//       try {
//         const syncIterator = Reservoir.Sales.sync(db, syncMetadata, 1000);
//         for await (const pageDetails of syncIterator) {
//           console.log(
//             `Synced: ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}  Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`
//           );
//           if (Date.now() > stop) {
//             return;
//           }
//           if (pageDetails.numEventsSaved < pageDetails.pageSize) {
//             await sleep(pollInterval);
//             if (Date.now() > stop) {
//               return;
//             }
//           } else if (options?.delay) {
//             await sleep(options.delay);
//           }
//         }
//       } catch (err) {
//         console.error(
//           `Failed to complete sync for ${syncMetadata.data.metadata.chainId}:${syncMetadata.data.metadata.type}:${
//             syncMetadata.data.metadata.collection ?? ''
//           }`,
//           err
//         );
//       }
//     })
//   );
// }
