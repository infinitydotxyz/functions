import { BigNumber } from 'ethers';
import pThrottle from 'p-throttle';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { Logger } from '@/lib/logger';
import { getClient } from '@/lib/reservoir/api';
import { getEvents as getReservoirAskEvents } from '@/lib/reservoir/api/events/ask-events';
import { getEvents as getReservoirBidEvents } from '@/lib/reservoir/api/events/bid-events';
import { AskEventV3, BidEventV3 } from '@/lib/reservoir/api/events/types';
import { ReservoirClient } from '@/lib/reservoir/api/get-client';
import { ReservoirWebsocketClient } from '@/lib/reservoir/ws/client';
import { AskResponse, BidResponse } from '@/lib/reservoir/ws/response';
import { AskSubMessage, BidSubMessage } from '@/lib/reservoir/ws/subscription';
import { getProvider } from '@/lib/utils/ethersUtils';

import { SyncMetadata } from './sync';
import { OrderActiveEvent, OrderInactiveEvent } from './types';

export async function* streamEvents(
  client: ReservoirClient,
  initialSync: SyncMetadata,
  endTimestamp: number,
  checkAbort: () => void,
  logger: Logger
) {
  const limit = 1000;
  const getPageOptions = (sync: SyncMetadata) => {
    const pageOptions = {
      sortDirection: 'asc' as const,
      limit,
      endTimestamp: endTimestamp > 0 ? Math.floor(endTimestamp / 1000) : undefined,
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
        BigNumber.from(new Date(item.event.createdAt ?? Date.now()).getTime()).gte(sync.data.mostRecentEventId)
      );

      const hasNextPage = !!page.data.continuation;
      const continuation = !page.data.continuation ? sync.data.continuation : page.data.continuation;
      const mostRecentEventId =
        events.length > 0
          ? new Date(events[events.length - 1].event.createdAt || sync.data.mostRecentEventId).getTime()
          : sync.data.mostRecentEventId;
      return {
        events,
        sync: {
          metadata: {
            ...sync.metadata,
            updatedAt: Date.now()
          },
          data: {
            continuation: hasNextPage ? continuation : '',
            startTimestamp: hasNextPage ? sync.data.startTimestamp : endTimestamp,
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
    logger.info(
      `Page ${pageNum}. Events ${numEvents} Curr Event: ${sync.data.mostRecentEventId}. Behind by ${Math.floor(
        (Date.now() - sync.data.mostRecentEventId) / 1000
      )} seconds`
    );

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
  const price = order.price?.amount ?? order.price?.netAmount;
  const priceUsd = price?.usd;

  if (!priceUsd) {
    return null;
  }

  const status = order.status;
  const isCollectionBid = isBid && order?.criteria?.kind === 'collection';
  if (status === 'active') {
    const id = event.event.createdAt ? new Date(event.event.createdAt).getTime() : Date.now();
    const activeEvent: Omit<OrderActiveEvent, 'floorPriceUsd'> = {
      isListing: !isBid,
      isCollectionBid,
      id,
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

  const id = event.event.createdAt ? new Date(event.event.createdAt).getTime() : Date.now();
  const orderInactiveEvent: Omit<OrderInactiveEvent, 'floorPriceUsd'> = {
    isListing: !isBid,
    id,
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

type BatchItem = Omit<OrderInactiveEvent, 'floorPriceUsd'> | Omit<OrderActiveEvent, 'floorPriceUsd'>;
type Batch = {
  events: BatchItem[];
  sync: SyncMetadata;
};

export async function* streamBatches(
  sync: SyncMetadata,
  endTimestamp: number,
  blockNumber: number,
  batchSize: number,
  checkAbort: () => void,
  logger: Logger
) {
  const client = getClient(sync.metadata.chainId, config.reservoir.apiKey);
  const stream = streamEvents(client, sync, endTimestamp, checkAbort, logger);

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

export const transformRealtimeEvent = (
  chainId: string,
  blockNumber: number,
  response: AskResponse | BidResponse
): null | BatchItem => {
  const order = response.data;
  const isBid = order.side === 'buy';
  const price = order.price?.amount ?? order.price?.netAmount;
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
      id: response.published_at,
      orderId: order.id,
      blockNumber,
      status,
      kind: 'ORDER_ACTIVE',
      expiresAt: order.validUntil * 1000,
      timestamp: Date.now(),
      processed: false,
      priceUsd,
      collection: order.contract.toLowerCase(),
      chainId: chainId,
      maker: order.maker.toLowerCase()
    };

    return activeEvent;
  }

  const orderInactiveEvent: Omit<OrderInactiveEvent, 'floorPriceUsd'> = {
    isListing: !isBid,
    id: response.published_at,
    isCollectionBid,
    orderId: order.id,
    blockNumber,
    expiresAt: order.validUntil * 1000,
    status,
    kind: 'ORDER_INACTIVE',
    timestamp: Date.now(),
    processed: false,
    priceUsd,
    collection: order.contract.toLowerCase(),
    chainId,
    maker: order.maker.toLowerCase()
  };
  return orderInactiveEvent;
};

export async function ingestOrderEvents(sync: SyncMetadata, checkAbort: () => void, logger: Logger) {
  const db = getDb();

  // the client is chain specific
  const client = getClient(sync.metadata.chainId, config.reservoir.apiKey);

  // the block number used for all chains should be eth mainnet
  const ethMainnetProvider = getProvider('1');
  let ethMainnetBlockNumber = await ethMainnetProvider.getBlockNumber();

  setInterval(() => {
    ethMainnetProvider
      .getBlockNumber()
      .then((num) => {
        ethMainnetBlockNumber = num;
      })
      .catch((err) => {
        logger.warn(`Failed to get next block number ${err}`);
      });
  }, 15_000);

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

    const floorPrice = floorAsk?.price?.amount ?? floorAsk?.price?.netAmount;
    const topBidPrice = topBid?.price?.amount ?? topBid?.price?.netAmount;

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
          .doc(event.id.toString());
        await batchHandler.addAsync(ref, event, { merge: true });
      }
    }

    const syncRef = db
      .collection('pixl')
      .doc('orderCollections')
      .collection('pixlOrderSyncs')
      .doc(`${sync.metadata.chainId}: ${sync.metadata.type}`);
    await batchHandler.addAsync(syncRef, batch.sync, { merge: true });
    await batchHandler.flush();
    sync = batch.sync;
  };

  const BATCH_SIZE = 500;
  while (sync.data.startTimestamp < Date.now() - 3 * ONE_MIN) {
    const endTimestamp = Date.now();
    const stream = streamBatches(sync, endTimestamp, ethMainnetBlockNumber, BATCH_SIZE, checkAbort, logger);
    for await (const { batch, hasNextPage } of stream) {
      logger.log(`Saving batch of ${batch.events.length} events`);
      await saveBatch(batch);
      logger.log(`Saved batch`);

      if (!hasNextPage) {
        logger.log(`Completed backfill part 1!`);
        break;
      }
    }
  }

  const wsClient = new ReservoirWebsocketClient(sync.metadata.chainId, config.reservoir.apiKey, { logger });
  const getSub = (type: 'ask' | 'bid') => {
    if (type === 'ask') {
      const sub: AskSubMessage = {
        type: 'subscribe',
        event: 'ask.*',
        filters: {
          source: 'pixl.so'
        }
      };

      return sub;
    }
    const sub: BidSubMessage = {
      type: 'subscribe',
      event: 'bid.*',
      filters: {
        source: 'pixl.so'
      }
    };
    return sub;
  };

  const disconnectPromise = new Promise<number>((resolve) => {
    wsClient.on('disconnect', ({ timestamp }) => {
      resolve(timestamp);
    });
  });

  const connectPromise = new Promise<number>((resolve) => {
    wsClient.on('connect', ({ timestamp }) => {
      resolve(timestamp);
    });
  });

  let hasBackfilled = false;
  const realtimeBatch: Batch = {
    events: [],
    sync
  };

  let timer: NodeJS.Timer | null = null;
  const saveRealtimeItem = async (startTimestamp: number, event: BatchItem) => {
    realtimeBatch.events.push(event);
    const updatedSync: SyncMetadata = {
      metadata: {
        ...sync.metadata,
        updatedAt: Date.now()
      },
      data: {
        continuation: '',
        startTimestamp,
        mostRecentEventId: event.timestamp
      }
    };
    realtimeBatch.sync = updatedSync;

    const save = async () => {
      try {
        checkAbort();
      } catch (err) {
        wsClient.close({ shutdown: true });
        return;
      }

      if (realtimeBatch.events.length === 0) {
        return;
      }

      const batchCopy: Batch = {
        events: [...realtimeBatch.events],
        sync: {
          metadata: {
            ...realtimeBatch.sync.metadata
          },
          data: {
            ...realtimeBatch.sync.data
          }
        }
      };
      realtimeBatch.events = [];

      let successful = true;
      try {
        logger.log('Saving realtime batch...');
        await saveBatch(batchCopy);
        logger.log('Saved realtime batch!');
      } catch (err) {
        logger.error(`Failed to save batch ${err}`);
        successful = false;
      }
      return {
        successful,
        batch: batchCopy
      };
    };

    if (hasBackfilled) {
      if (realtimeBatch.events.length > BATCH_SIZE) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        await save();
      } else if (!timer) {
        timer = setTimeout(async () => {
          timer = null;
          await save();
        }, 15_000);
      }
    }
  };

  type Batch = {
    events: (Omit<OrderInactiveEvent, 'floorPriceUsd'> | Omit<OrderActiveEvent, 'floorPriceUsd'>)[];
    sync: SyncMetadata;
  };
  await wsClient.connect(
    {
      event: getSub(sync.metadata.type),
      handler: (item) => {
        logger.log(`Received event! ${item.published_at}`);
        const event = transformRealtimeEvent(sync.metadata.chainId, ethMainnetBlockNumber, item);
        if (event) {
          saveRealtimeItem(item.published_at - ONE_MIN, event).catch((err) => {
            logger.error(`Failed to process realtime event ${err}`);
          });
        }
      }
    },
    false
  );

  const connectTimestamp = await connectPromise;
  // sync any events up to the timestamp we connected
  const stream = streamBatches(sync, connectTimestamp, ethMainnetBlockNumber, 500, checkAbort, logger);
  for await (const { batch, hasNextPage } of stream) {
    logger.log(`Saving batch of ${batch.events.length} events`);
    await saveBatch(batch);
    logger.log(`Saved batch`);
    if (!hasNextPage) {
      logger.log(`Completed backfilling part 2!`);
      break;
    }
  }
  hasBackfilled = true;
  await disconnectPromise;

  logger.log(`Disconnected from realtime events`);
}
