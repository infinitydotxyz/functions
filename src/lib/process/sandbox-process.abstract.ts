import { BulkJobOptions, MetricsTime, Queue, Worker } from 'bullmq';
import EventEmitter from 'events';
import Redis from 'ioredis';

import { logger } from '../logger';
import { ProcessOptions, WithTiming } from './types';

export abstract class AbstractSandboxProcess<T extends { id: string }, U> extends EventEmitter {
  protected _workers: Worker<T, WithTiming<U>>[];
  protected _queue: Queue<T, WithTiming<U>>;

  public get queue() {
    return this._queue;
  }

  log(message: string) {
    logger.log(this.queueName, message);
  }
  error(message: string) {
    logger.error(this.queueName, message);
  }
  warn(message: string) {
    logger.warn(this.queueName, message);
  }

  constructor(
    protected _db: Redis,
    protected queueName: string,
    protected _workerFile: string,
    options?: ProcessOptions
  ) {
    super();
    const metrics =
      options?.enableMetrics === true
        ? {
            maxDataPoints: MetricsTime.ONE_WEEK
          }
        : options?.enableMetrics;

    this._queue = new Queue(this.queueName, {
      connection: this._db, // TODO should this be a duplicate?
      defaultJobOptions: {
        attempts: options?.attempts ?? 5,
        backoff: {
          type: 'exponential',
          delay: 10_000
        },
        removeOnComplete: true,
        removeOnFail: 10_000,
        delay: options?.delay ?? 0
      }
    });

    const concurrency = options?.concurrency ?? 1;
    this._workers = [];
    for (let i = 0; i < concurrency; i++) {
      const worker = new Worker<T, WithTiming<U>>(this.queueName, this._workerFile, {
        connection: this._db.duplicate(),
        concurrency: 1,
        autorun: false,
        metrics: metrics || undefined
      });
      this._workers.push(worker);
    }

    this._registerListeners(options?.debug);
  }

  public async run(): Promise<void> {
    await this._run();
  }

  public resume() {
    this._resume();
  }

  public async pause() {
    await this._pause();
  }

  public async close() {
    await this._close();
  }

  async add(job: T | T[]): Promise<void> {
    const arr = Array.isArray(job) ? job : [job];
    const jobs: {
      name: string;
      data: T;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: `${item.id}`,
        data: item
      };
    });
    await this._queue.addBulk(jobs);
  }

  protected async _run() {
    const promises = [];
    for (const worker of this._workers) {
      if (!worker.isRunning()) {
        const workerPromise = worker.run();
        promises.push(workerPromise);
      }
    }
    await Promise.all(promises);
  }

  protected _resume() {
    for (const worker of this._workers) {
      if (worker.isPaused()) {
        worker.resume();
      }
    }
  }

  protected async _pause() {
    const promises = [];
    for (const worker of this._workers) {
      if (!worker.isPaused()) {
        promises.push(worker.pause());
      }
    }
    await Promise.all(promises);
  }

  protected async _close() {
    const promises = [];
    for (const worker of this._workers) {
      if (worker.isPaused() || worker.isRunning()) {
        const workerPromise = worker.close();
        promises.push(workerPromise);
      }
    }
    const queuePromise = this._queue.close();

    return await Promise.all([...promises, queuePromise]);
  }

  protected _registerListeners(verbose = false): void {
    this._registerWorkerListeners(verbose);
    this._registerProcessListeners();
  }

  protected _registerProcessListeners() {
    process.setMaxListeners(process.listenerCount('SIGINT') + 1);
    process.once('SIGINT', async () => {
      try {
        await this.close();
        this.log(`Gracefully closed`);
      } catch (err) {
        this.error(`Error closing process: ${JSON.stringify(err)}`);
      }
    });
  }

  protected _registerWorkerListeners(verbose = false) {
    for (const worker of this._workers) {
      worker.on('error', (err) => {
        this.error(err.message);
      });
      if (verbose) {
        worker.on('active', (job) => {
          this.log(`job ${job.id} - activated`);
        });
        worker.on('progress', (job) => {
          this.log(`job ${job.id} - progress ${job.progress}`);
        });
        worker.on('completed', (job, result) => {
          this.log(
            `job ${job.id} - completed. Process Duration: ${
              result.timing.completed - result.timing.started
            }ms Lifecycle Duration: ${result.timing.completed - result.timing.created}ms`
          );
        });
        worker.on('failed', (job, err) => {
          this.warn(`job ${job?.data.id} - failed ${err.message}`);
        });

        worker.on('stalled', (jobId) => {
          this.log(`job: ${jobId} - stalled`);
        });

        worker.on('closing', () => {
          this.log(`worker - closing`);
        });
        worker.on('closed', () => {
          this.log(`worker - closed`);
        });

        worker.on('drained', () => {
          this.log(`worker - drained`);
        });

        worker.on('ioredis:close', () => {
          this.log(`ioredis - closed`);
        });

        worker.on('paused', () => {
          this.log(`worker - paused`);
        });

        worker.on('ready', () => {
          this.log(`worker - ready`);
        });

        worker.on('resumed', () => {
          this.log(`worker - resumed`);
        });
      }
    }
  }
}
