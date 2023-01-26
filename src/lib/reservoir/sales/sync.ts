import { ChainId } from '@infinityxyz/lib/types/core';
import { NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { DocRef } from '@/firestore/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { Reservoir } from '../..';
import { FlattenedPostgresNFTSale } from '../api/sales';
import { SyncMetadata } from './types';

export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
  pageSize = 1000
) {
  if (initialSync?.data?.metadata?.isPaused) {
    throw new Error('Sync paused');
  }

  let pageNumber = 0;
  const client = Reservoir.Api.getClient(initialSync.data.metadata.chainId, config.reservoir.apiKey);
  const method = Reservoir.Api.Sales.getSales;

  const getNextBlockRange = async (
    chainId: ChainId,
    currentBlockRange: SyncMetadata['data']['blockRange']
  ): Promise<SyncMetadata['data']['blockRange']> => {
    const provider = getProvider(chainId);
    const currentBlock = await provider.getBlock('latest');
    const prevEndTimestamp = currentBlockRange.endTimestamp;
    const newEndTimestamp = currentBlock.timestamp * 1000 + 1000;
    return {
      continuation: undefined,
      startTimestamp: prevEndTimestamp,
      endTimestamp: newEndTimestamp
    };
  };

  const { pgDB, pgp } = config.pg.getPG();
  const batchSaveToPostgres = async (data: FlattenedPostgresNFTSale[]) => {
    const table = 'eth_nft_sales';

    const columnSet = new pgp.helpers.ColumnSet(Object.keys(data[0]), { table });
    const query = pgp.helpers.insert(data, columnSet) + ' ON CONFLICT DO NOTHING';
    await pgDB.none(query);
  };

  const collection = initialSync.data.metadata.collection ? { collection: initialSync.data.metadata.collection } : {};
  while (true) {
    try {
      const { numEventsSaved, continuation } = await db.runTransaction(async (txn) => {
        const snap = await txn.get(initialSync.ref);
        const currentSync = snap.data() as SyncMetadata;

        if (currentSync.metadata.isPaused) {
          throw new Error('Sync paused');
        }

        const page = await method(client, {
          continuation: currentSync.data.blockRange.continuation || undefined,
          startTimestamp: Math.floor(currentSync.data.blockRange.startTimestamp / 1000),
          endTimestamp: Math.ceil(currentSync.data.blockRange.endTimestamp / 1000),
          limit: pageSize,
          ...collection
        });
        const numItems = (page.data ?? []).length;

        if (page.continuation !== currentSync.data.blockRange.continuation) {
          const tokensRefsMaps = new Map<string, DocRef<NftDto>>();
          page.data.forEach((item) => {
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
          if (tokensRefs.length === 0) {
            const tokensSnap = await txn.getAll(...tokensRefs);
            const tokensMap = new Map<string, Partial<NftDto>>();
            tokensSnap.forEach((snap) => {
              tokensMap.set(snap.ref.path, (snap.data() ?? {}) as Partial<NftDto>);
            });

            const data = page.data.map((item) => {
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
                  token?.image?.url || token?.image?.originalUrl || token?.alchemyCachedImage || item.token_image
              };
            });

            await batchSaveToPostgres(data as FlattenedPostgresNFTSale[]);
          }
        }

        const hasNextPage =
          !!page.continuation &&
          page.continuation !== currentSync.data.blockRange.continuation &&
          numItems === pageSize;
        let blockRange: SyncMetadata['data']['blockRange'];
        if (hasNextPage) {
          blockRange = {
            ...currentSync.data.blockRange,
            continuation: page.continuation
          };
        } else {
          blockRange = await getNextBlockRange(currentSync.metadata.chainId, currentSync.data.blockRange);
        }
        pageNumber += 1;

        /**
         * update sync metadata
         */
        const update: Partial<SyncMetadata> = {
          data: {
            eventsProcessed: currentSync.data.eventsProcessed + numItems,
            blockRange
          }
        };
        txn.set(initialSync.ref, update, { merge: true });

        return {
          numEventsSaved: numItems,
          continuation: blockRange.continuation
        };
      });

      yield {
        continuation,
        pageNumber,
        pageSize,
        numEventsSaved
      };
    } catch (err) {
      console.error(err);
      await sleep(10_000);
    }
  }
}
