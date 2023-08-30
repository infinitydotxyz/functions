import { Firestore } from 'firebase-admin/firestore';
import { NftSaleEventV2 } from 'functions/aggregate-sales-stats/types';



import { ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants, sleep, trimLowerCase } from '@infinityxyz/lib/utils';



import { BatchHandler } from '@/firestore/batch-handler';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';



import { getReservoirSales } from '../api/sales/sales';
import { FlattenedNFTSale } from '../api/sales/types';
import { SyncMetadata } from './types';


export async function syncPage(
  db: FirebaseFirestore.Firestore,
  supportedCollections: SupportedCollectionsProvider,
  sync: SyncMetadata,
  checkAbort: () => { abort: boolean }
) {
  if (sync.metadata.isPaused) {
    throw new Error('Paused');
  }

  const { lastItemProcessed, numSales, lastItemProcessedTimestamp } = await processSales(
    db,
    supportedCollections,
    { data: sync },
    checkAbort
  );

  if (!lastItemProcessed) {
    throw new Error('No last item processed');
  }

  const endTimestamp = lastItemProcessedTimestamp ? lastItemProcessedTimestamp - 60_000 : sync.data.endTimestamp;

  const update: Partial<SyncMetadata> = {
    data: {
      eventsProcessed: sync.data.eventsProcessed + numSales,
      lastItemProcessed: lastItemProcessed,
      endTimestamp
    }
  };

  return { sync: update, hasNextPage: false, numEvents: numSales };
}

export async function* getSales(
  _syncData: { lastIdProcessed: string; startTimestamp: number; collection?: string },
  chainId: ChainId,
  checkAbort: () => { abort: boolean }
) {
  let continuation: string | undefined;
  let attempts = 0;
  let firstItem: Partial<FlattenedNFTSale> | undefined;
  const collection = _syncData.collection ? { collection: _syncData.collection } : {};
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const pageSales: Partial<FlattenedNFTSale>[] = [];
      const page = await getReservoirSales(chainId, {
        ...collection,
        continuation,
        startTimestamp: Math.floor(_syncData.startTimestamp / 1000),
        limit: pageSize
      });

      const { abort } = checkAbort();
      if (abort) {
        throw new Error('Abort');
      }

      for (const item of page?.data ?? []) {
        if (!firstItem) {
          firstItem = item;
        }

        if (item.id === _syncData.lastIdProcessed) {
          logger.log('sync-sale-events', `Hit last processed id ${firstItem?.id ?? ''}`);
          yield {
            sales: pageSales,
            firstItemId: firstItem.id,
            firstItemTimestamp: firstItem.sale_timestamp,
            complete: true
          };
          return;
        }
        pageSales.push(item);
      }

      if (pageSales.length < pageSize) {
        logger.log('sync-sale-events', `Page size less than max. id ${firstItem?.id ?? ''}`);
        yield { sales: pageSales, firstItemId: firstItem?.id ?? '', complete: true };
        return;
      } else if (!page?.continuation) {
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

const batchSaveToFirestore = async (
  db: Firestore,
  supportedCollections: SupportedCollectionsProvider,
  data: { saleData: Partial<FlattenedNFTSale>; chainId: ChainId }[]
) => {
  const nftSales = data.map(({ saleData: item, chainId }) => {
    const nftSaleEventV2: NftSaleEventV2 = {
      data: {
        chainId: chainId,
        txHash: item.txhash ?? '',
        blockNumber: item.block_number ?? 0,
        collectionAddress: item.collection_address ?? '',
        collectionName: item.collection_name ?? '',
        tokenId: item.token_id ?? '',
        tokenImage: item.token_image ?? '',
        saleTimestamp: item.sale_timestamp ?? 0,
        salePrice: item.sale_price ?? '',
        salePriceEth: item.sale_price_eth ?? 0,
        saleCurrencyAddress: item.sale_currency_address ?? '',
        saleCurrencyDecimals: item.sale_currency_decimals ?? 0,
        saleCurrencySymbol: item.sale_currency_symbol ?? '',
        seller: item.seller ?? '',
        buyer: item.buyer ?? '',
        marketplace: item.marketplace ?? '',
        marketplaceAddress: item.marketplace_address ?? '',
        bundleIndex: item.bundle_index ?? 0,
        logIndex: item.log_index ?? 0,
        quantity: item.quantity ?? '1'
      },
      metadata: {
        timestamp: item.sale_timestamp ?? 0,
        updatedAt: Date.now(),
        processed: true
      }
    };

    return {
      saleV2: nftSaleEventV2,
      id: item.id
    };
  });

  const batchHandler = new BatchHandler();
  const salesCollectionRef = db.collection(firestoreConstants.SALES_COLL);
  for (const { saleV2, id } of nftSales) {
    if (!id) {
      continue;
    }

    // write to sales collection
    const saleDocRef = salesCollectionRef.doc(id);
    await batchHandler.addAsync(saleDocRef, saleV2, { merge: true });

    // write sale to users involved if source is pixl
    if (saleV2.data.marketplace === 'pixl.so' && saleV2.data.buyer && saleV2.data.seller) {
      const buyerSalesDocRef = db
        .collection(firestoreConstants.USERS_COLL)
        .doc(trimLowerCase(saleV2.data.buyer))
        .collection(firestoreConstants.SALES_COLL)
        .doc(id);
      await batchHandler.addAsync(buyerSalesDocRef, saleV2, { merge: true });
      const sellerSalesDocRef = db
        .collection(firestoreConstants.USERS_COLL)
        .doc(trimLowerCase(saleV2.data.seller))
        .collection(firestoreConstants.SALES_COLL)
        .doc(id);
      await batchHandler.addAsync(sellerSalesDocRef, saleV2, { merge: true });
    }
  }

  await batchHandler.flush();
};

const processSales = async (
  db: Firestore,
  supportedCollections: SupportedCollectionsProvider,
  currentSync: { data: SyncMetadata },
  checkAbort: () => { abort: boolean }
) => {
  let numSales = 0;
  const iterator = getSales(
    {
      lastIdProcessed: currentSync.data.data.lastItemProcessed,
      startTimestamp: currentSync.data.data.endTimestamp,
      collection: currentSync.data.metadata.collection
    },
    currentSync.data.metadata.chainId,
    checkAbort
  );
  for await (const page of iterator) {
    logger.log('sync-sale-events', `Sync - processing page with ${page.sales.length} sales`);

    const data = page.sales.map((item) => {
      return { saleData: item, chainId: currentSync.data.metadata.chainId };
    });
    const firstSaleBlockNumber = data[0].saleData.block_number;
    const lastSaleBlockNumber = data[data.length - 1].saleData.block_number;
    logger.log(
      'sync-sale-events',
      `Saving ${data.length} sales from block ${firstSaleBlockNumber} to ${lastSaleBlockNumber}`
    );
    await batchSaveToFirestore(db, supportedCollections, data);
    logger.log('sync-sale-events', 'Saved to firestore');

    numSales += page.sales.length;
    if (page.complete) {
      logger.log('sync-sale-events', `Hit end of page, waiting for all events to to saved`);
      return { lastItemProcessed: page.firstItemId, lastItemProcessedTimestamp: page.firstItemTimestamp, numSales };
    }
    logger.log('sync-sale-events', `Not at end of page, continuing`);
  }

  throw new Error('Failed to complete sync');
};