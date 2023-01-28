// import { NftDto } from '@infinityxyz/lib/types/dto';
// import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

// import { config } from '@/config/index';
// import { DocRef } from '@/firestore/types';

// import { Reservoir } from '../..';
// import { FlattenedPostgresNFTSale } from '../api/sales';
// import { SyncMetadata } from './types';
// import { FlattenedPostgresNFTSaleWithId } from '../api/sales/types';
// import { ChainId } from '@infinityxyz/lib/types/core';

// export async function *getSales(_syncData: {lastIdProcessed: string, endTimestamp: number}, chainId: ChainId ) {
//   const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
//   const method = Reservoir.Api.Sales.getSales;
//   async function *getReservoirPage(stopAtId: string, endTimestampMs: number) {
//     let continuation: string | undefined;
//     let attempts = 0;
//     let firstItem: FlattenedPostgresNFTSaleWithId | undefined;
//     // eslint-disable-next-line no-constant-condition
//     while(true) {
//       const pageSales: FlattenedPostgresNFTSaleWithId[] = []
//       try{
//         const page = await method(client, {
//           continuation,
//           endTimestamp: Math.floor(endTimestampMs / 1000),
//           limit: 1000,
//         });

//         for(const item of page.data) {
//           if(!firstItem) {
//             firstItem = item as FlattenedPostgresNFTSaleWithId;
//           }

//           if(item.id === stopAtId) {
//             yield { sales: pageSales, firstItemId: firstItem.id, complete: true };
//             return;
//           }
//           pageSales.push(item as FlattenedPostgresNFTSaleWithId);
//         }

//         if(!page.continuation) {
//           throw new Error('No continuation');
//         }
//         continuation = page.continuation;
//         attempts = 0;
//         yield { sales: pageSales, complete: false };
//       } catch(err) {
//         attempts += 1;
//         if(attempts > 3) {
//           throw err
//         }
//         console.error(err);
//         await sleep(3000);
//       }
//     }
//   }

//   const pageIterator = getReservoirPage(_syncData.lastIdProcessed, _syncData.endTimestamp);
//   for await(const page of pageIterator) {
//     yield page;
//   }
// }

// export async function* sync(
//   db: FirebaseFirestore.Firestore,
//   initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
//   pageSize = 1000
// ) {
//   if (initialSync?.data?.metadata?.isPaused) {
//     throw new Error('Sync paused');
//   }

//   let pageNumber = 0;

//   const { pgDB, pgp } = config.pg.getPG();
//   const batchSaveToPostgres = async (data: FlattenedPostgresNFTSale[]) => {
//     const table = 'eth_nft_sales';

//     const columnSet = new pgp.helpers.ColumnSet(Object.keys(data[0]), { table });
//     const query = pgp.helpers.insert(data, columnSet) + ' ON CONFLICT DO NOTHING';
//     await pgDB.none(query);
//   };

//   let lastIdProcessed = initialSync.data.data.lastItemProcessed;
//   const endTimestamp = initialSync.data.data.endTimestamp;
//   // eslint-disable-next-line no-constant-condition
//   while(true) {

//     try {
//       const { numEventsSaved, continuation } = await db.runTransaction(async (txn) => {
//         const snap = await txn.get(initialSync.ref);
//         const currentSync = snap.data() as SyncMetadata;

//     const pageIterator = getSales({ lastIdProcessed, endTimestamp }, initialSync.data.metadata.chainId);
//     for await(const page of pageIterator) {

//       if(page.complete) {
//         lastIdProcessed = page.firstItemId || lastIdProcessed;
//         // TODO save
//       }
//     }
//   }

//   while (true) {
//     try {
//       const { numEventsSaved, continuation } = await db.runTransaction(async (txn) => {
//         const snap = await txn.get(initialSync.ref);
//         const currentSync = snap.data() as SyncMetadata;

//         if (currentSync.metadata.isPaused) {
//           throw new Error('Sync paused');
//         }

//         const page = await method(client, {
//           continuation: currentSync.data.continuation || undefined,
//           startTimestamp: Math.ceil(currentSync.data.startTimestamp / 1000),
//           limit: pageSize,
//           ...collection
//         });
//         const numItems = (page.data ?? []).length;

//         const filteredSales = page.data.reduce((acc, item) => {
//           if(acc.hitLastItemProcessed) {
//             return acc;
//           } else if (item.id === currentSync.data.lastItemProcessed) {
//             acc.hitLastItemProcessed = true;
//             return acc;
//           }
//             acc.items.push(item as FlattenedPostgresNFTSaleWithId);
//             return acc;

//         }, { items: [] as FlattenedPostgresNFTSaleWithId[], hitLastItemProcessed: false }).items;

//         if (page.continuation !== currentSync.data.continuation) {

//           const tokensRefsMaps = new Map<string, DocRef<NftDto>>();
//           filteredSales.forEach((item) => {
//             if (item.token_id) {
//               const ref = db
//                 .collection(firestoreConstants.COLLECTIONS_COLL)
//                 .doc(`${currentSync.metadata.chainId}:${item.collection_address}`)
//                 .collection(firestoreConstants.COLLECTION_NFTS_COLL)
//                 .doc(item.token_id) as DocRef<NftDto>;
//               tokensRefsMaps.set(ref.path, ref);
//             }
//           });

//           const tokensRefs = [...tokensRefsMaps.values()];
//           if (tokensRefs.length > 0) {
//             const tokensSnap = await txn.getAll(...tokensRefs);
//             const tokensMap = new Map<string, Partial<NftDto>>();
//             tokensSnap.forEach((snap) => {
//               tokensMap.set(snap.ref.path, (snap.data() ?? {}) as Partial<NftDto>);
//             });

//             const data = filteredSales.map(({id, ...item}) => {
//               const ref = db
//                 .collection(firestoreConstants.COLLECTIONS_COLL)
//                 .doc(`${currentSync.metadata.chainId}:${item.collection_address}`)
//                 .collection(firestoreConstants.COLLECTION_NFTS_COLL)
//                 .doc(item.token_id ?? '') as DocRef<NftDto>;
//               const token = tokensMap.get(ref.path);
//               return {
//                 ...item,
//                 collection_name: token?.collectionName ?? item.collection_name,
//                 token_image:
//                   token?.image?.url || token?.alchemyCachedImage || item.token_image || token?.image?.originalUrl
//               };
//             });

//             await batchSaveToPostgres(data as FlattenedPostgresNFTSale[]);
//           }
//         }

//         const hasNextPage =
//           !!page.continuation && page.continuation !== currentSync.data.continuation && numItems === pageSize;

//         const update: Partial<SyncMetadata> = {
//           data: {
//             eventsProcessed: currentSync.data.eventsProcessed + numItems,
//             continuation: hasNextPage ? page.continuation : '',
//             lastItemProcessed: hasNextPage ? currentSync.data.lastItemProcessed : filteredSales?.[0]?.id,
//             startTimestamp: filteredSales?.[0]?.sale_timestamp || currentSync.data.startTimestamp
//           }
//         };
//         if (hasNextPage) {

//           // blockRange = {
//           //   ...currentSync.data.blockRange,
//           //   continuation: page.continuation
//           // };
//         } else {
//           // blockRange = await getNextBlockRange(currentSync.metadata.chainId, currentSync.data.blockRange);

//         }
//         pageNumber += 1;

//         /**
//          * update sync metadata
//          */
//         const update: Partial<SyncMetadata> = {
//           data: {
//             eventsProcessed: currentSync.data.eventsProcessed + numItems,
//             blockRange
//           }
//         };
//         txn.set(initialSync.ref, update, { merge: true });

//         return {
//           numEventsSaved: numItems,
//           continuation: blockRange.continuation
//         };
//       });

//       yield {
//         continuation,
//         pageNumber,
//         pageSize,
//         numEventsSaved
//       };
//     } catch (err) {
//       console.error(err);
//       await sleep(10_000);
//     }
//   }
// }
