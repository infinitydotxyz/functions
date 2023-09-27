import { Firestore } from 'firebase-admin/firestore';
import { NftSaleEventV2 } from 'functions/aggregate-sales-stats/types';

import { firestoreConstants, sleep, trimLowerCase } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { CollRef } from '@/firestore/types';
import { Logger, logger } from '@/lib/logger';
import { BuyEvent } from '@/lib/rewards-v2/referrals/sdk';
import { getProvider } from '@/lib/utils/ethersUtils';

import { getReservoirSales } from '../api/sales/sales';
import { FlattenedNFTSale } from '../api/sales/types';
import { SyncMetadata } from './types';

export async function syncPage(
  db: FirebaseFirestore.Firestore,
  sync: SyncMetadata,
  checkAbort: () => { abort: boolean },
  options?: { logger?: Logger }
) {
  const { lastItemProcessed, numSales, lastItemProcessedTimestamp } = await processSales(
    db,
    { data: sync },
    checkAbort,
    options
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
  chainId: string,
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

export const batchSaveToFirestore = async (
  db: Firestore,
  data: { saleData: Partial<FlattenedNFTSale>; chainId: string }[]
) => {
  const nftSales = data.map(({ saleData: item, chainId }) => {
    const nftSaleEventV2: NftSaleEventV2 = {
      data: {
        chainId: chainId as NftSaleEventV2['data']['chainId'],
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
        fillSource: item.fill_source ?? '',
        washTradingScore: item.wash_trading_score ?? 0,
        marketplace: item.marketplace ?? '',
        marketplaceAddress: item.marketplace_address ?? '',
        bundleIndex: item.bundle_index ?? 0,
        logIndex: item.log_index ?? 0,
        quantity: item.quantity ?? '1',
        salePriceUsd: item.sale_price_usd ?? 0
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

  // currentEthBlockNumber is lazily set below
  let currentEthMainnetBlockNumber: null | number = null;

  for (const { saleV2, id } of nftSales) {
    if (!id) {
      continue;
    }

    // write to sales collection
    const saleDocRef = salesCollectionRef.doc(id);
    await batchHandler.addAsync(saleDocRef, saleV2, { merge: true });

    // write sale to users involved if source is pixl
    const isNativeBuy = saleV2.data.marketplace === 'pixl.so';
    const isNativeFill = saleV2.data.fillSource === 'pixl.so';
    if (isNativeBuy && saleV2.data.buyer && saleV2.data.seller) {
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

    if (isNativeBuy || isNativeFill) {
      if (currentEthMainnetBlockNumber == null) {
        const ethMainnetProvider = getProvider('1');
        const ethMainnetBlockNumber = await ethMainnetProvider.getBlockNumber();
        currentEthMainnetBlockNumber = ethMainnetBlockNumber;
      }
      // save to stats and rewards if the sale is filled or from pixl.so
      const buyEvent: BuyEvent = {
        kind: 'BUY',
        isNativeBuy,
        isNativeFill,
        user: saleV2.data.buyer,
        chainId: saleV2.data.chainId,
        blockNumber: currentEthMainnetBlockNumber,
        sale: {
          blockNumber: saleV2.data.blockNumber,
          buyer: saleV2.data.buyer,
          seller: saleV2.data.seller,
          txHash: saleV2.data.txHash,
          logIndex: saleV2.data.logIndex,
          bundleIndex: saleV2.data.bundleIndex,
          fillSource: saleV2.data.fillSource,
          washTradingScore: saleV2.data.washTradingScore,
          marketplace: saleV2.data.marketplace,
          marketplaceAddress: saleV2.data.marketplaceAddress,
          quantity: saleV2.data.quantity,
          collectionAddress: saleV2.data.collectionAddress,
          tokenId: saleV2.data.tokenId,
          saleTimestamp: saleV2.data.saleTimestamp,
          salePriceUsd: saleV2.data.salePriceUsd
        },
        processed: false,
        timestamp: saleV2.metadata.timestamp
      };

      const statsCollRef = db.collection('pixl').doc('salesCollections').collection('salesEvents') as CollRef<BuyEvent>;
      const rewardRef = db.collection('pixl').doc('pixlRewards').collection('pixlRewardEvents');
      await batchHandler.addAsync(statsCollRef.doc(id), buyEvent, { merge: true });
      await batchHandler.addAsync(rewardRef.doc(id), buyEvent, { merge: true });
    }
  }

  await batchHandler.flush();
};

const processSales = async (
  db: Firestore,
  currentSync: { data: SyncMetadata },
  checkAbort: () => { abort: boolean },
  options?: { logger?: Logger }
) => {
  let numSales = 0;
  const iterator = getSales(
    {
      lastIdProcessed: currentSync.data.data.lastItemProcessed,
      startTimestamp: currentSync.data.data.endTimestamp
    },
    currentSync.data.metadata.chainId,
    checkAbort
  );
  for await (const page of iterator) {
    options?.logger?.info?.(`Sync - processing page with ${page.sales.length} sales`);

    const data = page.sales.map((item) => {
      return { saleData: item, chainId: currentSync.data.metadata.chainId };
    });
    const firstSaleBlockNumber = data[0].saleData.block_number;
    const lastSaleBlockNumber = data[data.length - 1].saleData.block_number;
    options?.logger?.info?.(`Saving ${data.length} sales from block ${firstSaleBlockNumber} to ${lastSaleBlockNumber}`);
    await batchSaveToFirestore(db, data);
    options?.logger?.info?.('Saved to firestore');

    numSales += page.sales.length;
    if (page.complete) {
      options?.logger?.info?.(`Hit end of page, waiting for all events to to saved`);
      return { lastItemProcessed: page.firstItemId, lastItemProcessedTimestamp: page.firstItemTimestamp, numSales };
    }
    options?.logger?.info?.(`Not at end of page, continuing`);
  }

  throw new Error('Failed to complete sync');
};
