import { BulkJobOptions, Job } from 'bullmq';
import Redis from 'ioredis';

import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';

export interface JobData<SubQueueJob> {
  id: string;
  queueId: string;
  job: SubQueueJob;
}

export class QueueOfQueues<SubQueueJob extends { id: string }, SubQueueResult> extends AbstractProcess<
  JobData<SubQueueJob>,
  { id: string }
> {
  protected _queues: Map<string, AbstractProcess<SubQueueJob, SubQueueResult>>;

  constructor(
    _db: Redis,
    queueName: string,
    protected initQueue: (
      id: string,
      queue: AbstractProcess<JobData<SubQueueJob>, { id: string }>
    ) => AbstractProcess<SubQueueJob, SubQueueResult>,
    options?: ProcessOptions
  ) {
    super(_db, queueName, options);
    this._queues = new Map();
  }

  protected getQueue(id: string) {
    let queue = this._queues.get(id);

    if (!queue) {
      queue = this.initQueue(id, this);

      queue.run().catch((err) => {
        this.error(err);
      });

      this._queues.set(id, queue);
    }

    return queue;
  }

  async add(data: JobData<SubQueueJob> | JobData<SubQueueJob>[]): Promise<void> {
    const arr = Array.isArray(data) ? data : [data];
    const jobs: {
      name: string;
      data: JobData<SubQueueJob>;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: item.queueId,
        data: item
      };
    });
    await this._queue.addBulk(jobs);
  }

  public async processJob(job: Job<JobData<SubQueueJob>, { id: string }, string>): Promise<{ id: string }> {
    const queue = this.getQueue(job.data.queueId);
    await queue.add(job.data.job);

    return {
      id: job.data.queueId
    };
  }
}
