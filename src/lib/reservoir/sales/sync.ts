import { BigNumber } from 'ethers';
import { NftSaleEventV2 } from 'functions/aggregate-sales-stats/types';

import {
  InfinityLinkType,
  ChainId,
  EtherscanLinkType,
  EventType,
  NftSale,
  NftSaleEvent,
  OrderSource,
  SaleSource,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import { NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, formatEth, getEtherscanLink, getInfinityLink, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
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

  const batchSaveToFirestore = async (data: { pgSale: FlattenedPostgresNFTSaleWithId; token: Partial<NftDto> }[]) => {
    const nftSales = data.map(({ pgSale: item, token }) => {
      const feedEvent: NftSaleEvent = {
        type: EventType.NftSale,
        buyer: item.buyer,
        seller: item.seller,
        price: item.sale_price_eth,
        paymentToken: item.sale_currency_address,
        source: item.marketplace as SaleSource,
        tokenStandard: TokenStandard.ERC721,
        txHash: item.txhash,
        quantity: parseInt(item.quantity, 10),
        externalUrl: getEtherscanLink(
          { type: EtherscanLinkType.Transaction, transactionHash: item.txhash },
          initialSync.data.metadata.chainId
        ),
        likes: 0,
        comments: 0,
        timestamp: item.sale_timestamp,
        chainId: initialSync.data.metadata.chainId,
        collectionAddress: item.collection_address,
        collectionName: token?.collectionName ?? '',
        collectionSlug: token?.collectionSlug ?? '',
        collectionProfileImage: '',
        hasBlueCheck: token?.hasBlueCheck ?? false,
        internalUrl: getInfinityLink({
          type: InfinityLinkType.Collection,
          addressOrSlug: item.collection_address,
          chainId: initialSync.data.metadata.chainId
        }),
        tokenId: item.token_id,
        image: item.token_image,
        nftName: token?.metadata?.name ?? '',
        nftSlug: token?.slug ?? '',
        usersInvolved: [item.buyer, item.seller]
      };

      const base: NftSale = {
        chainId: initialSync.data.metadata.chainId,
        txHash: item.txhash,
        blockNumber: item.block_number,
        timestamp: item.sale_timestamp,
        collectionAddress: item.collection_address,
        tokenId: item.token_id,
        price: item.sale_price_eth,
        paymentToken: item.sale_currency_address,
        buyer: item.buyer,
        seller: item.seller,
        quantity: parseInt(item.quantity, 10),
        source: item.marketplace as OrderSource,
        isAggregated: false,
        isDeleted: false,
        isFeedUpdated: true,
        tokenStandard: TokenStandard.ERC721
      };

      const nftSaleEventV2: NftSaleEventV2 = {
        data: {
          chainId: initialSync.data.metadata.chainId,
          txHash: item.txhash,
          blockNumber: item.block_number,
          collectionAddress: item.collection_address,
          collectionName: token?.collectionName ?? '',
          tokenId: item.token_id,
          tokenImage: item.token_image,
          saleTimestamp: item.sale_timestamp,
          salePrice: item.sale_price,
          salePriceEth: item.sale_price_eth,
          saleCurrencyAddress: item.sale_currency_address,
          saleCurrencyDecimals: item.sale_currency_decimals,
          saleCurrencySymbol: item.sale_currency_symbol,
          seller: item.seller,
          buyer: item.buyer,
          marketplace: item.marketplace as OrderSource,
          marketplaceAddress: item.marketplace_address,
          bundleIndex: item.bundle_index,
          logIndex: item.log_index,
          quantity: item.quantity
        },
        metadata: {
          timestamp: item.sale_timestamp,
          updatedAt: Date.now(),
          processed: false
        }
      };

      if (item.marketplace === 'flow') {
        const PROTOCOL_FEE_BPS = 250;
        const protocolFeeWei = BigNumber.from(item.sale_price).mul(PROTOCOL_FEE_BPS).div(10000);
        const protocolFeeEth = formatEth(protocolFeeWei.toString());
        return {
          sale: {
            ...base,
            protocolFeeBPS: PROTOCOL_FEE_BPS,
            protocolFee: protocolFeeEth,
            protocolFeeWei: protocolFeeWei.toString()
          },
          feedEvent,
          pgSale: item,
          saleV2: nftSaleEventV2
        };
      }
      return {
        sale: base,
        feedEvent,
        pgSale: item,
        saleV2: nftSaleEventV2
      };
    });

    const batchHandler = new BatchHandler();
    const salesCollectionRef = db.collection(firestoreConstants.SALES_COLL);
    const feedCollectionRef = db.collection(firestoreConstants.FEED_COLL);
    for (const sale of nftSales) {
      const id = `${sale.pgSale.txhash}:${sale.pgSale.log_index}:${sale.pgSale.bundle_index}`;
      const saleDocRef = salesCollectionRef.doc(id);
      const feedDocRef = feedCollectionRef.doc(id);
      const saleEventV2Ref = db
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${initialSync.data.metadata.chainId}:${sale.saleV2.data.collectionAddress}`)
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(sale.saleV2.data.tokenId)
        .collection('nftSaleEvents')
        .doc(id);
      await batchHandler.addAsync(saleDocRef, sale.sale, { merge: true });
      await batchHandler.addAsync(feedDocRef, sale.feedEvent, { merge: true });
      await batchHandler.addAsync(saleEventV2Ref, sale.saleV2, { merge: true });
    }

    await batchHandler.flush();
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
                pgSale: {
                  ...item,
                  collection_name: token?.collectionName ?? item.collection_name,
                  token_image:
                    token?.image?.url || token?.alchemyCachedImage || item.token_image || token?.image?.originalUrl
                } as FlattenedPostgresNFTSaleWithId,
                token: token ?? {}
              };
            });

            await Promise.all([
              batchSaveToPostgres(data.map((item) => item.pgSale) as FlattenedPostgresNFTSale[]),
              batchSaveToFirestore(data)
            ]);
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
