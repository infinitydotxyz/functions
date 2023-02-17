import { BulkJobOptions, Job } from 'bullmq';
import { ethers } from 'ethers';
import { Redis } from 'ioredis';
import { ExecutionError } from 'redlock';

import { ChainId } from '@infinityxyz/lib/types/core';
import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';

import { redlock } from '../redis';
import { AbstractBlockProcessor } from './block-processor.abstract';

interface JobData {
  id: string;
  chainId: ChainId;
  httpsProviderUrl: string;
  wsProviderUrl: string;
}

interface JobResult {
  id: string;
}

export class BlockScheduler extends AbstractProcess<JobData, JobResult> {
  constructor(
    db: Redis,
    chainId: ChainId,
    protected _blockProcessors: AbstractBlockProcessor[],
    options?: ProcessOptions
  ) {
    super(db, `block-scheduler:chain:${chainId}`, options);
  }

  async add(data: JobData | JobData[]): Promise<void> {
    const arr = Array.isArray(data) ? data : [data];
    const jobs: {
      name: string;
      data: JobData;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: item.id,
        data: item
      };
    });
    await this._queue.addBulk(jobs);
  }

  async run(): Promise<void> {
    await this._run();
  }

  async processJob(job: Job<JobData, JobResult, string>): Promise<JobResult> {
    const lockKey = `block-scheduler:chain:${job.data.chainId}:lock`;
    const lockDuration = 15_000;

    const chainId = parseInt(job.data.chainId, 10);
    const wsProvider = new ethers.providers.WebSocketProvider(job.data.wsProviderUrl, chainId);
    const httpProvider = new ethers.providers.StaticJsonRpcProvider(job.data.httpsProviderUrl, chainId);

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

      const finalizedBlock = await httpProvider.getBlock('finalized');

      for (const blockProcessor of this._blockProcessors) {
        await blockProcessor.add({
          id: `${blockNumber}:${finalizedBlock.number}`,
          latestBlockNumber: blockNumber,
          finalizedBlockNumber: finalizedBlock.number,
          chainId: job.data.chainId,
          httpsProviderUrl: job.data.httpsProviderUrl
        });
      }
    };

    try {
      await redlock.using([lockKey], lockDuration, async (signal) => {
        this.log(`Acquired lock!`);

        const callback = handler(signal);
        await new Promise<void>((resolve, reject) => {
          cancel = () => {
            wsProvider.off('block', callback);
            if (signal.aborted) {
              reject(signal.error ?? new Error('Aborted'));
            } else {
              resolve();
            }
          };

          wsProvider.on('block', callback);
        });
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
}
