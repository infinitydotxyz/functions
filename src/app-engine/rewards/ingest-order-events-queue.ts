import { Job } from 'bullmq';
import Redis from 'ioredis';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { DocRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { ingestOrderEvents } from '@/lib/rewards-v2/orders/ingest';
import { SyncMetadata } from '@/lib/rewards-v2/orders/sync';

import { ExecutionError, redlock } from '../redis';

export interface IngestOrderEventsJobData {
  id: string;
}

export interface IngestOrderEventsJobResult {
  id: string;
  status: 'completed' | 'skipped' | 'errored';
}

export class IngestOrderEventsQueue extends AbstractProcess<IngestOrderEventsJobData, IngestOrderEventsJobResult> {
  constructor(
    id: string,
    protected chainId: string,
    protected type: 'ask' | 'bid',
    redis: Redis,
    options?: ProcessOptions
  ) {
    super(redis, `${id}:chain:${chainId}:type:${type}`, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(
    job: Job<IngestOrderEventsJobData, IngestOrderEventsJobResult>
  ): Promise<IngestOrderEventsJobResult> {
    const db = getDb();
    const lockDuration = 5000;

    const syncRef = db
      .collection('pixl')
      .doc('orderCollections')
      .collection('pixlOrderSyncs')
      .doc(`${this.chainId}:${this.type}`) as DocRef<SyncMetadata>;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped'
      };
    }

    const id = `ingest-order-events:chain:${this.chainId}:type:${this.type}:lock`;
    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };
        const snap = await syncRef.get();
        const sync = snap.data() ?? {
          metadata: {
            type: this.type,
            chainId: this.chainId,
            updatedAt: Date.now()
          },
          data: {
            continuation: '',
            startTimestamp: Date.now(),
            mostRecentEventId: '0'
          }
        };
        await ingestOrderEvents(sync, checkAbort, this.logger);
      });
      return {
        id: job.data.id,
        status: 'completed'
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${id}`);
      } else {
        this.error(`${err}`);
      }
      return {
        id: job.data.id,
        status: 'errored'
      };
    }
  }
}
