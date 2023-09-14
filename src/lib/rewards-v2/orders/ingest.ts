import { BigNumber } from 'ethers';
import pThrottle from 'p-throttle';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { Logger } from '@/lib/logger';
import { getClient } from '@/lib/reservoir/api';
import { getEvents as getReservoirAskEvents } from '@/lib/reservoir/api/events/ask-events';
import { getEvents as getReservoirBidEvents } from '@/lib/reservoir/api/events/bid-events';
import { AskEventV3, BidEventV3 } from '@/lib/reservoir/api/events/types';
import { ReservoirClient } from '@/lib/reservoir/api/get-client';
import { getProvider } from '@/lib/utils/ethersUtils';

import { SyncMetadata } from './sync';
import { OrderActiveEvent, OrderInactiveEvent } from './types';

export async function* streamEvents(
  client: ReservoirClient,
  initialSync: SyncMetadata,
  checkAbort: () => void,
  logger: Logger
) {
  const limit = 1000;
  const getPageOptions = (sync: SyncMetadata) => {
    const pageOptions = {
      sortDirection: 'asc' as const,
      limit,
      startTimestamp: sync.data.startTimestamp > 0 ? Math.floor(sync.data.startTimestamp / 1000) : 0,
      continuation: sync.data.continuation ? sync.data.continuation : undefined
    };

    return pageOptions;
  };

  let sync: SyncMetadata = initialSync;
  const getEvents = initialSync.metadata.type === 'ask' ? getReservoirAskEvents : getReservoirBidEvents;

  const getPage = async (sync: SyncMetadata) => {
    try {
      const page = await getEvents(client, getPageOptions(sync));
      const events = (page.data.events as (AskEventV3 | BidEventV3)[]).filter((item: AskEventV3 | BidEventV3) =>
        BigNumber.from(item.event.id).gt(sync.data.mostRecentEventId)
      );

      const hasNextPage = !!page.data.continuation;
      const continuation = !page.data.continuation ? sync.data.continuation : page.data.continuation;
      const mostRecentEventId = events.length > 0 ? events[events.length - 1].event.id : sync.data.mostRecentEventId;

      return {
        events,
        sync: {
          metadata: {
            ...sync.metadata,
            updatedAt: Date.now()
          },
          data: {
            continuation: continuation,
            startTimestamp: sync.data.startTimestamp,
            mostRecentEventId
          }
        } as SyncMetadata,
        hasNextPage
      };
    } catch (err) {
      return {
        error: err
      };
    }
  };

  let pageNum = 0;
  let numEvents = 0;

  let nextPage = getPage(sync);

  while (true) {
    checkAbort();
    const page = await nextPage;
    if ('error' in page) {
      throw page.error;
    }

    const { events, hasNextPage, sync: updatedSync } = page;
    pageNum += 1;
    numEvents += events.length;
    sync = updatedSync;
    logger.info(`Page ${pageNum}. Events ${numEvents} Curr Event: ${sync.data.mostRecentEventId}`);

    // load next page while current page is being processed
    nextPage = getPage(sync);
    yield {
      events,
      sync,
      hasNextPage
    };
  }
}

function transformEvent(chainId: string, event: AskEventV3 | BidEventV3, blockNumber: number) {
  const isBid = 'bid' in event;
  const order = isBid ? event.bid : event.order;
  const price = order.price?.netAmount ?? order.price?.amount;
  const priceUsd = price?.usd;

  if (!priceUsd) {
    return null;
  }

  const status = order.status;
  const isCollectionBid = isBid && order?.criteria?.kind === 'collection';
  if (status === 'active') {
    const activeEvent: Omit<OrderActiveEvent, 'floorPriceUsd'> = {
      isListing: !isBid,
      isCollectionBid,
      id: event.event.id,
      orderId: order.id,
      blockNumber,
      status,
      kind: 'ORDER_ACTIVE',
      expiresAt: order.validUntil * 1000,
      timestamp: Date.now(),
      processed: false,
      priceUsd,
      collection: order.contract,
      chainId,
      maker: order.maker.toLowerCase()
    };

    return activeEvent;
  }

  const orderInactiveEvent: Omit<OrderInactiveEvent, 'floorPriceUsd'> = {
    isListing: !isBid,
    id: event.event.id,
    isCollectionBid,
    orderId: order.id,
    blockNumber,
    expiresAt: order.validUntil * 1000,
    status,
    kind: 'ORDER_INACTIVE',
    timestamp: Date.now(),
    processed: false,
    priceUsd,
    collection: order.contract,
    chainId,
    maker: order.maker.toLowerCase()
  };
  return orderInactiveEvent;
}

type Batch = {
  events: (Omit<OrderInactiveEvent, 'floorPriceUsd'> | Omit<OrderActiveEvent, 'floorPriceUsd'>)[];
  sync: SyncMetadata;
};

export async function* streamBatches(
  sync: SyncMetadata,
  blockNumber: number,
  batchSize: number,
  checkAbort: () => void,
  logger: Logger
) {
  const client = getClient(sync.metadata.chainId, config.reservoir.apiKey);
  const stream = streamEvents(client, sync, checkAbort, logger);

  const batch: Batch = {
    events: [],
    sync: sync
  };

  for await (const { sync: updatedSync, events: pageEvents, hasNextPage } of stream) {
    for (const item of pageEvents) {
      const order = 'bid' in item ? item.bid : item.order;
      // only process pixl.so events
      // ignore reprice events
      if (order.source === 'pixl.so' && item.event.kind !== 'reprice') {
        const event = transformEvent(sync.metadata.chainId, item, blockNumber);
        if (event) {
          batch.events.push(event);
        }
      }
    }

    batch.sync = updatedSync;
    if (!hasNextPage) {
      yield { batch, hasNextPage };
    } else if (batch.events.length > batchSize) {
      yield { batch, hasNextPage };
    }
  }
}

export async function ingestOrderEvents(sync: SyncMetadata, checkAbort: () => void, logger: Logger) {
  const db = getDb();
  const provider = getProvider('1');
  const client = getClient(sync.metadata.chainId, config.reservoir.apiKey);
  const blockNumber = await provider.getBlockNumber();

  const getCollectionStats = async (collection: string) => {
    const response = await client(
      '/stats/v2',
      'get'
    )({
      query: {
        collection
      }
    });

    const floorAsk = response.data.stats?.market?.floorAsk;
    const topBid = response.data.stats?.market?.topBid;

    const floorPrice = floorAsk?.price?.netAmount ?? floorAsk?.price?.amount;
    const topBidPrice = topBid?.price?.netAmount ?? topBid?.price?.amount;

    const floorPriceUsd = floorPrice?.usd ?? 0;
    const topBidPriceUsd = topBidPrice?.usd ?? 0;

    return {
      floorPrice: floorPriceUsd,
      topBidPrice: topBidPriceUsd
    };
  };

  const saveBatch = async (batch: Batch) => {
    const batchHandler = new BatchHandler(100);
    if (batch.events.length > 0) {
      const collections = batch.events.reduce((acc, item) => {
        acc.add(item.collection);
        return acc;
      }, new Set<string>());

      const collectionFloorPrices: Record<string, number> = {};
      const throttle = pThrottle({
        limit: 3,
        interval: 1000
      });

      const getColl = throttle(async (coll: string) => {
        return await getCollectionStats(coll);
      });
      for (const collection of [...collections]) {
        checkAbort();
        const { floorPrice } = await getColl(collection);
        collectionFloorPrices[collection] = floorPrice;
      }

      // add the floor price to the events
      const events = batch.events.map((item) => {
        return {
          ...item,
          floorPriceUsd: collectionFloorPrices[item.collection] ?? 0
        };
      }) as (OrderActiveEvent | OrderInactiveEvent)[];

      // save the events
      for (const event of events) {
        const ref = db
          .collection('pixl')
          .doc('orderCollections')
          .collection('pixlOrders')
          .doc(event.orderId)
          .collection('pixlOrderEvents')
          .doc(event.id);
        await batchHandler.addAsync(ref, event, { merge: true });
      }
    }

    const syncRef = db
      .collection('pixl')
      .doc('orderCollections')
      .collection('pixlOrderSyncs')
      .doc(`${sync.metadata.chainId}:${sync.metadata.type}`);
    await batchHandler.addAsync(syncRef, batch.sync, { merge: true });
    await batchHandler.flush();
  };

  const stream = streamBatches(sync, blockNumber, 500, checkAbort, logger);

  for await (const { batch, hasNextPage } of stream) {
    logger.log(`Saving batch of ${batch.events.length} events`);
    await saveBatch(batch);
    logger.log(`Saved batch`);

    if (!hasNextPage) {
      logger.log(`Fully synced!`);
      return;
    }
  }
}