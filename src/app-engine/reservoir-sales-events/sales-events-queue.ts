import { BulkJobOptions, Job } from 'bullmq';
import Redis from 'ioredis';
import { ExecutionError } from 'redlock';

import { ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions, WithTiming } from '@/lib/process/types';
import { syncPage } from '@/lib/reservoir/sales/sync-page';

import { Reservoir } from '../../lib';
import { JobData } from '../queue-of-queues';
import { redlock } from '../redis';

export interface SalesJobData {
  id: string;
  syncMetadata: Reservoir.Sales.Types.SyncMetadata['metadata'];
  syncDocPath: string;
}

export type SalesJobResult = WithTiming<{
  id: string;
  status: 'skipped' | 'paused' | 'errored' | 'completed';
  syncMetadata: Reservoir.Sales.Types.SyncMetadata['metadata'];
  syncDocPath: string;
}>;

export class SalesEventsQueue extends AbstractProcess<SalesJobData, SalesJobResult> {
  constructor(
    id: string,
    redis: Redis,
    protected _supportedCollections: SupportedCollectionsProvider,
    options?: ProcessOptions
  ) {
    super(redis, id, options);
  }

  async add(data: SalesJobData | SalesJobData[]): Promise<void> {
    const arr = Array.isArray(data) ? data : [data];
    const jobs: {
      name: string;
      data: SalesJobData;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: item.id,
        data: item
      };
    });
    await this._queue.addBulk(jobs);
  }

  public enqueueOnComplete(queue: AbstractProcess<JobData<SalesJobData>, { id: string }>) {
    this._worker.on('completed', async (job, result) => {
      if (result.status === 'completed' || result.status === 'errored') {
        try {
          await queue.add({
            id: result.id,
            queueId: this.queueName,
            job: {
              id: result.id,
              syncMetadata: result.syncMetadata,
              syncDocPath: result.syncDocPath
            }
          });
        } catch (err) {
          this.error(JSON.stringify(err));
        }
      }
    });
    return;
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<SalesJobData, SalesJobResult, string>): Promise<SalesJobResult> {
    const db = getDb();
    const syncRef = db.doc(job.data.syncDocPath) as DocRef<Reservoir.Sales.Types.SyncMetadata>;
    const lockDuration = 5_000;
    const start = Date.now();
    const id = syncRef.path;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped',
        syncMetadata: job.data.syncMetadata,
        syncDocPath: job.data.syncDocPath,
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    }

    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          const abort = signal.aborted;
          return { abort };
        };

        const checkAbortThrow = () => {
          const { abort } = checkAbort();
          if (abort) {
            throw new Error('Abort');
          }
        };

        const syncSnap = await syncRef.get();
        checkAbortThrow();
        const sync = syncSnap.data();
        if (!sync) {
          return;
        }

        const result = await syncPage(db, this._supportedCollections, sync, checkAbort);
        checkAbortThrow();

        await syncRef.set(result.sync, { merge: true });
        checkAbortThrow();

        this.log(`Synced ${result.numEvents} events. Has next page: ${result.hasNextPage ? 'yes' : 'no'}`);
        if (!result.hasNextPage) {
          await sleep(10_000);
        }

        return;
      });

      return {
        id: job.data.id,
        status: 'completed',
        syncMetadata: job.data.syncMetadata,
        syncDocPath: job.data.syncDocPath,
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${syncRef.id}`);
        await sleep(3000);
      } else if (err instanceof Error && err.message.includes('Paused')) {
        this.error(`${err}`);
        return {
          id: job.data.id,
          status: 'paused',
          syncMetadata: job.data.syncMetadata,
          syncDocPath: job.data.syncDocPath,
          timing: {
            created: job.timestamp,
            started: start,
            completed: Date.now()
          }
        };
      } else {
        this.error(`${err}`);
      }

      return {
        id: job.data.id,
        status: 'errored',
        syncMetadata: job.data.syncMetadata,
        syncDocPath: job.data.syncDocPath,
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    }
  }
}
