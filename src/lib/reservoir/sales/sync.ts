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
import {
  firestoreConstants,
  formatEth,
  getCollectionDocId,
  getEtherscanLink,
  getInfinityLink,
  sleep
} from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { DocRef, DocSnap, Firestore } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';

import { Reservoir } from '../..';
import { FlattenedPostgresNFTSale } from '../api/sales';
import { FlattenedPostgresNFTSaleWithId } from '../api/sales/types';
import { SyncMetadata } from './types';

export async function* getSales(
  _syncData: { lastIdProcessed: string; startTimestamp: number },
  chainId: ChainId,
  checkAbort: () => { abort: boolean }
) {
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const method = Reservoir.Api.Sales.getSales;
  let continuation: string | undefined;
  let attempts = 0;
  let firstItem: FlattenedPostgresNFTSaleWithId | undefined;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const pageSales: FlattenedPostgresNFTSaleWithId[] = [];
      const page = await method(client, {
        continuation,
        startTimestamp: Math.floor(_syncData.startTimestamp / 1000),
        limit: pageSize
      });

      const { abort } = checkAbort();
      if (abort) {
        throw new Error('Abort');
      }

      for (const item of page.data) {
        if (!firstItem) {
          firstItem = item as FlattenedPostgresNFTSaleWithId;
        }

        if (item.id === _syncData.lastIdProcessed) {
          logger.log('sync-sale-events', `Hit last processed id ${firstItem?.id ?? ''}`);
          yield { sales: pageSales, firstItemId: firstItem.id, complete: true };
          return;
        }
        pageSales.push(item as FlattenedPostgresNFTSaleWithId);
      }

      if (pageSales.length < pageSize) {
        logger.log('sync-sale-events', `Page size less than max. id ${firstItem?.id ?? ''}`);
        yield { sales: pageSales, firstItemId: firstItem?.id ?? '', complete: true };
        return;
      } else if (!page.continuation) {
        logger.log('sync-sale-events', `No continuation. id ${firstItem?.id ?? ''}`);
        yield { sales: pageSales, complete: true, firstItemId: firstItem?.id ?? '' };
        return;
      }
      continuation = page.continuation;
      attempts = 0;
      yield { sales: pageSales, complete: false };
    } catch (err) {
      if (err instanceof Error && err.message === 'Abort') {
        throw err;
      }
      attempts += 1;
      if (attempts > 3) {
        throw err;
      }
      logger.error('sync-sale-events', `Error: ${err}`);
      await sleep(3000);
    }
  }
}

const batchSaveToPostgres = async (data: FlattenedPostgresNFTSale[]) => {
  const pg = config.pg.getPG();
  if (pg) {
    // support development env where we don't have a postgres connection
    const { pgDB, pgp } = pg;
    const table = 'eth_nft_sales';

    const columnSet = new pgp.helpers.ColumnSet(Object.keys(data[0]), { table });
    const insert = pgp.helpers.insert(data, columnSet);
    const updateColumns = Object.keys(data[0])
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(', ');
    const query = `${insert} ON CONFLICT ON CONSTRAINT eth_nft_sales_pkey DO UPDATE SET ${updateColumns}`;

    // const columnSet = new pgp.helpers.ColumnSet(Object.keys(data[0]), { table });
    // const query =
    //   pgp.helpers.insert(data, columnSet) +
    //   ` ON CONFLICT DO NOTHING`;
    await pgDB.none(query);
  }
};

const batchSaveToFirestore = async (
  db: Firestore,
  supportedCollections: SupportedCollectionsProvider,
  data: { pgSale: FlattenedPostgresNFTSale; token: Partial<NftDto>; chainId: ChainId }[]
) => {
  const nftSales = data.map(({ pgSale: item, token, chainId }) => {
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
      externalUrl: getEtherscanLink({ type: EtherscanLinkType.Transaction, transactionHash: item.txhash }, chainId),
      likes: 0,
      comments: 0,
      timestamp: item.sale_timestamp,
      chainId,
      collectionAddress: item.collection_address,
      collectionName: token?.collectionName ?? '',
      collectionSlug: token?.collectionSlug ?? '',
      collectionProfileImage: '',
      hasBlueCheck: token?.hasBlueCheck ?? false,
      internalUrl: getInfinityLink({
        type: InfinityLinkType.Collection,
        addressOrSlug: item.collection_address,
        chainId: chainId
      }),
      tokenId: item.token_id,
      image: item.token_image,
      nftName: token?.metadata?.name ?? '',
      nftSlug: token?.slug ?? '',
      usersInvolved: [item.buyer, item.seller]
    };

    const base: NftSale = {
      chainId: chainId,
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
        chainId: chainId,
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

  /**
   * If this is set higher it causes the app to stall when deployed
   */
  const batchHandler = new BatchHandler(100);
  const salesCollectionRef = db.collection(firestoreConstants.SALES_COLL);
  const feedCollectionRef = db.collection(firestoreConstants.FEED_COLL);
  for (const { sale, saleV2, pgSale, feedEvent } of nftSales) {
    const id = `${pgSale.txhash}:${pgSale.log_index}:${pgSale.bundle_index}`;
    const saleDocRef = salesCollectionRef.doc(id);
    const feedDocRef = feedCollectionRef.doc(id);
    await batchHandler.addAsync(saleDocRef, sale, { merge: true });

    // only save to feed if coll is supported
    const collId = getCollectionDocId({
      collectionAddress: feedEvent.collectionAddress,
      chainId: feedEvent.chainId
    });
    if (supportedCollections.has(collId)) {
      await batchHandler.addAsync(feedDocRef, feedEvent, { merge: true });
    }

    const saleEventV2Ref = db
      .collection(firestoreConstants.COLLECTIONS_COLL)
      .doc(`${sale.chainId}:${saleV2.data.collectionAddress}`)
      .collection(firestoreConstants.COLLECTION_NFTS_COLL)
      .doc(saleV2.data.tokenId)
      .collection('nftSaleEvents')
      .doc(id);
    await batchHandler.addAsync(saleEventV2Ref, saleV2, { merge: true });
  }

  await batchHandler.flush();
};

const processSales = async (
  db: Firestore,
  supportedCollections: SupportedCollectionsProvider,
  currentSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
  checkAbort: () => { abort: boolean }
) => {
  let numSales = 0;
  const iterator = getSales(
    { lastIdProcessed: currentSync.data.data.lastItemProcessed, startTimestamp: currentSync.data.data.endTimestamp },
    currentSync.data.metadata.chainId,
    checkAbort
  );
  for await (const page of iterator) {
    logger.log('sync-sale-events', `Sync - processing page with ${page.sales.length} sales`);
    const tokensRefsMaps = new Map<string, DocRef<NftDto>>();
    page.sales.forEach((item) => {
      if (item.token_id) {
        const ref = db
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(`${currentSync.data.metadata.chainId}:${item.collection_address}`)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(item.token_id) as DocRef<NftDto>;
        tokensRefsMaps.set(ref.path, ref);
      }
    });

    const tokensRefs = [...tokensRefsMaps.values()];
    if (tokensRefs.length > 0) {
      const tokensSnap = await db.getAll(...tokensRefs);
      const tokensMap = new Map<string, DocSnap<NftDto>>();
      tokensSnap.forEach((snap) => {
        tokensMap.set(snap.ref.path, snap as DocSnap<NftDto>);
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const data = page.sales.map(({ id, ...item }) => {
        const ref = db
          .collection(firestoreConstants.COLLECTIONS_COLL)
          .doc(`${currentSync.data.metadata.chainId}:${item.collection_address}`)
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(item.token_id ?? '') as DocRef<NftDto>;
        const snap = tokensMap.get(ref.path);
        const token = snap?.data();
        return {
          pgSale: {
            ...item,
            collection_name: snap?.get('collectionName') ?? item.collection_name ?? '',
            token_image:
              token?.image?.url || token?.alchemyCachedImage || item.token_image || token?.image?.originalUrl || ''
          },
          token: token ?? {},
          chainId: currentSync.data.metadata.chainId
        };
      });
      const firstSaleBlockNumber = data[0].pgSale.block_number;
      const lastSaleBlockNumber = data[data.length - 1].pgSale.block_number;
      logger.log(
        'sync-sale-events',
        `Saving ${data.length} sales from block ${firstSaleBlockNumber} to ${lastSaleBlockNumber}`
      );
      await Promise.all([
        batchSaveToPostgres(data.map((item) => item.pgSale)).then(() => {
          logger.log('sync-sale-events', 'Saved to postgres');
        }),
        batchSaveToFirestore(db, supportedCollections, data).then(() => {
          logger.log('sync-sale-events', 'Saved to firestore');
        })
      ]);
    }

    numSales += page.sales.length;
    if (page.complete) {
      logger.log('sync-sale-events', `Hit end of page, waiting for all events to to saved`);
      return { lastItemProcessed: page.firstItemId, numSales };
    }
    logger.log('sync-sale-events', `Not at end of page, continuing`);
  }

  throw new Error('Failed to complete sync');
};

export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> },
  supportedCollections: SupportedCollectionsProvider,
  checkAbort: () => { abort: boolean }
) {
  let pageNumber = 0;
  let totalItemsProcessed = 0;

  while (true) {
    const currentSyncSnap = await initialSync.ref.get();
    const currentSync = currentSyncSnap.data() as SyncMetadata;

    const { abort } = checkAbort();
    if (abort) {
      throw new Error(`Abort`);
    } else if (currentSync.metadata.isPaused) {
      throw new Error(`Paused`);
    }
    const { lastItemProcessed, numSales } = await processSales(
      db,
      supportedCollections,
      { data: currentSync, ref: initialSync.ref },
      checkAbort
    );
    if (!lastItemProcessed) {
      throw new Error('No last item processed');
    }
    await db.runTransaction(async (txn) => {
      const snap = await txn.get(initialSync.ref);
      const prevSetSync = snap.data() as SyncMetadata;
      if (prevSetSync.data.lastItemProcessed !== currentSync.data.lastItemProcessed) {
        throw new Error('Sync metadata changed while processing');
      } else if (prevSetSync.data.endTimestamp !== currentSync.data.endTimestamp) {
        throw new Error('Sync metadata changed while processing');
      } else if (prevSetSync.data.eventsProcessed !== currentSync.data.eventsProcessed) {
        throw new Error('Sync metadata changed while processing');
      }

      txn.set(
        initialSync.ref,
        {
          data: {
            lastItemProcessed,
            endTimestamp: prevSetSync.data.endTimestamp,
            eventsProcessed: prevSetSync.data.eventsProcessed + numSales
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
