import { ChainId } from '@infinityxyz/lib/types/core';
import { NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { DocRef } from '@/firestore/types';

import { Reservoir } from '../..';
import { FlattenedPostgresNFTSale } from '../api/sales';
import { FlattenedPostgresNFTSaleWithId } from '../api/sales/types';
import { SyncMetadata } from './types';

export async function* getSales(_syncData: { lastIdProcessed: string; startTimestamp: number }, chainId: ChainId) {
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const method = Reservoir.Api.Sales.getSales;
  let continuation: string | undefined;
  let attempts = 0;
  let firstItem: FlattenedPostgresNFTSaleWithId | undefined;
  // eslint-disable-next-line no-constant-condition
  const pageSize = 1000;
  while (true) {
    const pageSales: FlattenedPostgresNFTSaleWithId[] = [];
    try {
      const page = await method(client, {
        continuation,
        startTimestamp: Math.floor(_syncData.startTimestamp / 1000),
        limit: pageSize
      });

      for (const item of page.data) {
        if (!firstItem) {
          firstItem = item as FlattenedPostgresNFTSaleWithId;
        }

        if (item.id === _syncData.lastIdProcessed) {
          yield { sales: pageSales, firstItemId: firstItem.id, complete: true };
          return;
        }
        pageSales.push(item as FlattenedPostgresNFTSaleWithId);
      }

      if (!page.continuation) {
        yield { sales: pageSales, complete: true, firstItemId: firstItem?.id ?? '' };
        return;
      }
      continuation = page.continuation;
      attempts = 0;
      yield { sales: pageSales, complete: false };
    } catch (err) {
      attempts += 1;
      if (attempts > 3) {
        throw err;
      }
      console.error(err);
      await sleep(3000);
    }
  }
}

export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> }
) {
  if (initialSync?.data?.metadata?.isPaused) {
    throw new Error('Sync paused');
  }

  let pageNumber = 0;
  let totalItemsProcessed = 0;

  const { pgDB, pgp } = config.pg.getPG();
  const batchSaveToPostgres = async (data: FlattenedPostgresNFTSale[]) => {
    const table = 'eth_nft_sales';

    const columnSet = new pgp.helpers.ColumnSet(Object.keys(data[0]), { table });
    const query = pgp.helpers.insert(data, columnSet) + ' ON CONFLICT DO NOTHING';
    await pgDB.none(query);
  };

  while (true) {
    const { lastItemProcessed, numSales } = await db.runTransaction(async (txn) => {
      const snap = await txn.get(initialSync.ref);
      const currentSync = snap.data() as SyncMetadata;

      if (currentSync.metadata.isPaused) {
        throw new Error('Sync paused');
      }

      const processSales = async () => {
        let numSales = 0;
        const iterator = getSales(
          { lastIdProcessed: currentSync.data.lastItemProcessed, startTimestamp: currentSync.data.endTimestamp },
          initialSync.data.metadata.chainId
        );
        for await (const page of iterator) {
          const tokensRefsMaps = new Map<string, DocRef<NftDto>>();
          page.sales.forEach((item) => {
            if (item.token_id) {
              const ref = db
                .collection(firestoreConstants.COLLECTIONS_COLL)
                .doc(`${currentSync.metadata.chainId}:${item.collection_address}`)
                .collection(firestoreConstants.COLLECTION_NFTS_COLL)
                .doc(item.token_id) as DocRef<NftDto>;
              tokensRefsMaps.set(ref.path, ref);
            }
          });

          const tokensRefs = [...tokensRefsMaps.values()];
          if (tokensRefs.length > 0) {
            const tokensSnap = await initialSync.ref.firestore.getAll(...tokensRefs);
            const tokensMap = new Map<string, Partial<NftDto>>();
            tokensSnap.forEach((snap) => {
              tokensMap.set(snap.ref.path, (snap.data() ?? {}) as Partial<NftDto>);
            });

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const data = page.sales.map(({ id, ...item }) => {
              const ref = db
                .collection(firestoreConstants.COLLECTIONS_COLL)
                .doc(`${currentSync.metadata.chainId}:${item.collection_address}`)
                .collection(firestoreConstants.COLLECTION_NFTS_COLL)
                .doc(item.token_id ?? '') as DocRef<NftDto>;
              const token = tokensMap.get(ref.path);
              return {
                ...item,
                collection_name: token?.collectionName ?? item.collection_name,
                token_image:
                  token?.image?.url || token?.alchemyCachedImage || item.token_image || token?.image?.originalUrl
              };
            });
            await batchSaveToPostgres(data as FlattenedPostgresNFTSale[]);
          }
          numSales += page.sales.length;
          if (page.complete) {
            return { lastItemProcessed: page.firstItemId, numSales };
          }
        }

        throw new Error('Failed to complete sync');
      };

      const { lastItemProcessed, numSales } = await processSales();
      if (!lastItemProcessed) {
        throw new Error('No last item processed');
      }
      txn.set(
        initialSync.ref,
        {
          data: {
            lastItemProcessed,
            endTimestamp: initialSync.data.data.endTimestamp,
            eventsProcessed: initialSync.data.data.eventsProcessed + numSales
          }
        },
        { merge: true }
      );
      return { numSales, lastItemProcessed };
    });

    pageNumber += 1;
    totalItemsProcessed += numSales;
    yield { numItemsInPage: numSales, pageNumber, totalItemsProcessed, lastItemProcessed };
  }
}
