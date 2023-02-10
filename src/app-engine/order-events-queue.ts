import { BulkJobOptions, Job } from 'bullmq';
import Redis from 'ioredis';
import { ExecutionError } from 'redlock';

import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions, WithTiming } from '@/lib/process/types';

import { Reservoir } from '../lib';
import { redlock } from './redis';

export interface JobData {
  id: string;
  syncMetadata: Reservoir.OrderEvents.Types.SyncMetadata;
  syncDocPath: string;
}

export type JobResult = WithTiming<{
  id: string;
}>;

export class OrderEventsQueue extends AbstractProcess<JobData, JobResult> {
  constructor(redis: Redis, protected _supportedCollections: SupportedCollectionsProvider, options?: ProcessOptions) {
    super(redis, 'reservoir-order-event-sync', options);
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

  async processJob(job: Job<JobData, JobResult, string>): Promise<JobResult> {
    const db = getDb();
    const syncRef = db.doc(job.data.syncDocPath) as DocRef<Reservoir.OrderEvents.Types.SyncMetadata>;
    const lockDuration = ONE_MIN;
    const start = Date.now();

    try {
      const id = syncRef.path;
      const pollInterval = 10 * 1000;
      const delay = 1000;
      const syncMetadata = job.data.syncMetadata;
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          const abort = signal.aborted;
          return { abort };
        };

        try {
          const syncIterator = Reservoir.OrderEvents.sync(
            db,
            { data: job.data.syncMetadata, ref: syncRef },
            450,
            this._supportedCollections,
            checkAbort
          );

          for await (const pageDetails of syncIterator) {
            this.log(
              `Synced: ${syncMetadata.metadata.chainId}:${syncMetadata.metadata.type}  Found ${pageDetails.numEventsFound} Saved ${pageDetails.numEventsSaved} Page ${pageDetails.pageNumber}`
            );
            if (pageDetails.numEventsFound < pageDetails.pageSize) {
              await sleep(pollInterval);
            } else {
              await sleep(delay);
            }
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('Abort')) {
            this.warn(
              `Failed to complete sync for ${syncMetadata.metadata.chainId}:${syncMetadata.metadata.type}:${
                syncMetadata.metadata.collection ?? ''
              } ${err}`
            );
          } else {
            this.error(
              `Failed to complete sync for ${syncMetadata.metadata.chainId}:${syncMetadata.metadata.type}:${
                syncMetadata.metadata.collection ?? ''
              } ${err}`
            );
          }
        }
      });
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${syncRef.id}`);
      } else {
        this.error(`${err}`);
      }
    }

    return {
      id: job.data.id,
      timing: {
        created: job.timestamp,
        started: start,
        completed: Date.now()
      }
    };
  }
}
