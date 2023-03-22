import { Job } from 'bullmq';
import { ethers } from 'ethers';
import { Redis } from 'ioredis';
import { ExecutionError } from 'redlock';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { safeWebSocketSubscription } from '@/lib/utils/safe-websocket-subscription';

import { redlock } from '../../app-engine/redis';
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

    let cancel: undefined | (() => void);
    const handler = (signal: AbortSignal) => async (blockNumber: number) => {
      this.log(`Received block ${blockNumber}`);

      if (signal.aborted) {
        cancel?.();
        return;
      }

      const finalizedBlock = await this._httpProvider.getBlock('finalized');
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
    };

    try {
      await redlock.using([lockKey], lockDuration, async (signal) => {
        this.log(`Acquired lock!`);
        const callback = handler(signal);
        /**
         * use web sockets to attempt to get block numbers
         * right await
         */
        safeWebSocketSubscription(this._wsProvider.connection.url, async (provider) => {
          provider.on('block', callback);
          await Promise.resolve();
        });

        /**
         * poll in-case the websocket connection fails
         */
        const iterator = this._blockIterator(30_000);
        for await (const { blockNumber } of iterator) {
          if (signal.aborted) {
            return;
          }
          await callback(blockNumber);
        }
      });
    } catch (err) {
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
