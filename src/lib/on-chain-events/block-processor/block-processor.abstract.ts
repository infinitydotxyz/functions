import { BulkJobOptions } from 'bullmq';
import { Redis } from 'ioredis';

import { ChainId } from '@infinityxyz/lib/types/core';

import { AbstractSandboxProcess } from '@/lib/process/sandbox-process.abstract';
import { ProcessOptions } from '@/lib/process/types';

import { blockProcessorConfig } from './config';

export interface BlockProcessorJobData {
  id: string;
  latestBlockNumber: number;
  finalizedBlockNumber: number;
  chainId: ChainId;
  address: string;
  httpsProviderUrl: string;
  type: keyof typeof blockProcessorConfig;
}

export interface BlockProcessorJobResult {
  id: string;
  blocksProcessed: number;
  logsProcessed: number;
}

export abstract class AbstractBlockProcessor extends AbstractSandboxProcess<
  BlockProcessorJobData,
  BlockProcessorJobResult
> {
  abstract getKind(): keyof typeof blockProcessorConfig;

  public get address() {
    return this._address;
  }

  constructor(
    _db: Redis,
    protected _chainId: ChainId,
    type: string,
    protected _address: string,
    options?: ProcessOptions
  ) {
    super(_db, `block-processor:version:1:chain:${_chainId}:type:${type}`, `${__dirname}/worker.js`, options);
  }

  async add(job: BlockProcessorJobData, id?: string): Promise<void>;
  async add(jobs: BlockProcessorJobData[]): Promise<void>;
  async add(job: BlockProcessorJobData | BlockProcessorJobData[], id?: string): Promise<void> {
    const arr = Array.isArray(job) ? job : [job];
    if (Array.isArray(job) && id) {
      throw new Error(`Can only specify an id for a single job`);
    } else if (!Array.isArray(job) && id) {
      await this.queue.add(job.id, job, { jobId: id });
    } else {
      const jobs: {
        name: string;
        data: BlockProcessorJobData;
        opts?: BulkJobOptions | undefined;
      }[] = arr.map((item) => {
        return {
          name: `${item.id}`,
          data: item
        };
      });
      await this._queue.addBulk(jobs);
    }
  }
}
