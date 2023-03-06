import { Job } from 'bullmq';
import Redis from 'ioredis';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_HOUR, ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';

import { config } from '../config';
import { Reservoir } from '../lib';
import { redlock } from './redis';

export interface ReservoirOrderCacheJobData {
  id: string;
  chainId: ChainId;
  side: 'ask' | 'bid';
}

export type ReservoirOrderCacheJobResult = {
  id: string;
  numSupportedOrdersFound: number;
};

interface Cursor {
  chainId: ChainId;
  side: 'ask' | 'bid';
  startTimestamp: number;
}

export class ReservoirOrderCacheQueue extends AbstractProcess<
  ReservoirOrderCacheJobData,
  ReservoirOrderCacheJobResult
> {
  constructor(
    id: string,
    redis: Redis,
    protected _supportedCollections: SupportedCollectionsProvider,
    options?: ProcessOptions
  ) {
    super(redis, id, options);
  }

  async processJob(
    job: Job<ReservoirOrderCacheJobData, ReservoirOrderCacheJobResult>
  ): Promise<ReservoirOrderCacheJobResult> {
    const { id, chainId, side } = job.data;
    const lockKey = `reservoir:orders-cache:${chainId}:${side}:lock`;
    const lockDuration = 3_000;

    if (job.timestamp < Date.now() - ONE_MIN * 5) {
      this.log(`Skipping job ${id} because it is too old`);
      return {
        id,
        numSupportedOrdersFound: 0
      };
    }

    const cursorKey = `reservoir:orders-cache:${chainId}:${side}:cursor`;

    const getCursor = async () => {
      const minTimestamp = Date.now() - 5 * ONE_MIN;
      try {
        const cursorString = await this._db.get(cursorKey);
        const cursor = JSON.parse(cursorString ?? '') as Cursor;
        return {
          ...cursor,
          startTimestamp: Math.max(cursor.startTimestamp, minTimestamp)
        };
      } catch (err) {
        return {
          chainId,
          side,
          startTimestamp: minTimestamp
        };
      }
    };

    const saveCursor = async (startTimestamp: number) => {
      const cursor: Cursor = {
        chainId,
        side,
        startTimestamp
      };
      await this._db.set(cursorKey, JSON.stringify(cursor));
    };

    return await redlock.using([lockKey], lockDuration, async () => {
      try {
        const cursor = await getCursor();
        const results = await this.sync(chainId, side, cursor.startTimestamp);
        await saveCursor(results.newStartTimestamp);
        return {
          id: job.data.id,
          numSupportedOrdersFound: results.numSupportedOrdersFound
        };
      } catch (err) {
        this.error(`Failed to cache reservoir orders ${err}`);
        throw err;
      }
    });
  }

  async sync(chainId: ChainId, side: 'bid' | 'ask', startTimestampMs: number) {
    const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
    let continuation: undefined | string = undefined;
    let hasNextPage = true;
    let attempts = 0;
    const pageSize = 1000;
    const method = side === 'ask' ? Reservoir.Api.Orders.AskOrders.getOrders : Reservoir.Api.Orders.BidOrders.getOrders;
    const expiresAfter = ONE_HOUR;
    let numSupportedOrdersFound = 0;
    let numPages = 0;
    let numOrders = 0;
    const startTimestamp = Math.floor(startTimestampMs / 1000);
    let newStartTimestamp = startTimestampMs;
    while (hasNextPage) {
      numPages += 1;
      const cont: { continuation: string } = continuation ? { continuation } : ({} as any);
      const response = await method(client, {
        includeRawData: true,
        startTimestamp,
        sortBy: 'createdAt',
        limit: pageSize,
        ...cont
      });

      if (response.statusCode === 200) {
        attempts = 0;
        numOrders += (response.data.orders ?? []).length;
        for (const item of response.data.orders) {
          if (item.createdAt && new Date(item.createdAt).getTime() > newStartTimestamp) {
            newStartTimestamp = new Date(item.createdAt).getTime();
          }
        }

        const keyValues = response.data.orders
          .filter((item) => {
            if (!this._supportedCollections.has(`${chainId}:${item.contract}`)) {
              return false;
            } else if (item.side === 'buy' && item.kind !== 'flow') {
              return false; // TODO remove this to support other marketplace buy orders
            }
            return item && item.rawData;
          })
          .map((item) => {
            return [`reservoir:orders-cache:${item.id}`, JSON.stringify(item)];
          });

        const pipeline = this._db.pipeline();

        numSupportedOrdersFound += keyValues.length;
        for (const [key, value] of keyValues) {
          pipeline.set(key, value, 'PX', expiresAfter);
        }
        await pipeline.exec();

        continuation = response.data.continuation ?? undefined;
        hasNextPage = response.data.continuation != null && response.data.orders.length === pageSize;
      } else {
        this.warn(`Received status code ${response.statusCode} from Reservoir API`);
        await sleep(3000);
        attempts += 1;
        hasNextPage = attempts < 5;
      }
      this.log(
        `${chainId}:${side} Page ${numPages} Cached ${numSupportedOrdersFound} of ${numOrders} orders from Reservoir API hasNextPage=${hasNextPage}`
      );
    }
    return { numSupportedOrdersFound, numOrders, numPages, newStartTimestamp };
  }
}
