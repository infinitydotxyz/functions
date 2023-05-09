import { Job } from 'bullmq';
import { ethers } from 'ethers';
import { Redis } from 'ioredis';
import QuickLRU from 'quick-lru';
import { ExecutionError } from 'redlock';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';

import { redlock } from '../../app-engine/redis';
import { getBlockProvider } from '../utils/safe-websocket-subscription';
import { AbstractBlockProcessor } from './block-processor/block-processor.abstract';

interface JobData {
  id: string;
}

interface JobResult {
  id: string;
}

export class BlockScheduler extends AbstractProcess<JobData, JobResult> {
  constructor(
    db: Redis,
    protected _chainId: ChainId,
    protected _httpProvider: ethers.providers.StaticJsonRpcProvider,
    protected _wsProvider: ethers.providers.WebSocketProvider,
    protected _blockProcessors: AbstractBlockProcessor[],
    options?: ProcessOptions
  ) {
    super(db, `block-scheduler:chain:${_chainId}`, options);
  }

  async run(): Promise<void> {
    await this._run();
  }

  async processJob(job: Job<JobData, JobResult, string>): Promise<JobResult> {
    const lockKey = `block-scheduler:chain:${this._chainId}:lock`;
    const lockDuration = 15_000;

    if (job.timestamp < Date.now() - ONE_MIN * 5) {
      this.log(`Job is too old, skipping...`);
      return { id: job.data.id };
    }

    const jobIdsCache = new QuickLRU({
      maxSize: 128
    });
    const latestBlocksCache = new QuickLRU({
      maxSize: 128
    });

    let cancel: undefined | (() => void);
    const handler = (signal: AbortSignal) => async (blockNumber: number) => {
      this.log(`Received block ${blockNumber}`);

      if (signal.aborted) {
        cancel?.();
        return;
      }

      const finalizedBlock = await this._httpProvider.getBlock('finalized');

      const id = `${blockNumber}:${finalizedBlock.number}`;

      // only trigger processing for each id once
      if (!jobIdsCache.has(id)) {
        jobIdsCache.set(id, id);

        // cache logs for the block to reduce get logs requests
        if (!latestBlocksCache.has(blockNumber)) {
          latestBlocksCache.set(blockNumber, blockNumber);
          try {
            const latestBlockLogs = await this._httpProvider.getLogs({
              fromBlock: blockNumber,
              toBlock: blockNumber
            });
            await this._db.set(`latest:${blockNumber}:data:logs`, JSON.stringify(latestBlockLogs), 'PX', ONE_MIN);
          } catch (err) {
            this.warn(`Failed to cache logs ${err}`);
          }
        }

        for (const blockProcessor of this._blockProcessors) {
          await blockProcessor.add(
            {
              id: `${blockNumber}:${finalizedBlock.number}`,
              latestBlockNumber: blockNumber,
              finalizedBlockNumber: finalizedBlock.number,
              chainId: this._chainId,
              httpsProviderUrl: this._httpProvider.connection.url,
              address: blockProcessor.address,
              type: blockProcessor.getKind()
            },
            `chain:${this._chainId}:block:${blockNumber}:finalizedBlock:${finalizedBlock.number}`
          );
        }
      }
    };

    const blockProvider = getBlockProvider(this._wsProvider.connection.url);
    let cancelBlockSubscription: undefined | (() => void);
    try {
      await redlock.using([lockKey], lockDuration, async (signal) => {
        this.log(`Acquired lock!`);
        const callback = handler(signal);

        blockProvider.on('block', callback);

        cancelBlockSubscription = () => {
          blockProvider.off('block', callback);
        };
        /**
         * poll in-case the websocket connection fails
         */
        const iterator = this._blockIterator(3_000);
        for await (const { blockNumber } of iterator) {
          if (signal.aborted) {
            return;
          }
          try {
            await callback(blockNumber);
          } catch (err) {
            this.error(`Error in callback ${err}`);
          }
        }
      });
    } catch (err) {
      cancelBlockSubscription?.();
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock`);
        await sleep(3000);
      } else if (err instanceof Error) {
        this.error(`${err}`);
        return {
          id: job.data.id
        };
      } else {
        this.error(`Unknown error: ${err}`);
        return {
          id: job.data.id
        };
      }
    }
    return {
      id: job.data.id
    };
  }

  protected async *_blockIterator(delay: number) {
    while (true) {
      const blockNumber = await this._httpProvider.getBlockNumber();
      yield { blockNumber };
      await sleep(delay);
    }
  }
}
