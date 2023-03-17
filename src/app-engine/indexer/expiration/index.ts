import Redis from 'ioredis';

import { AbstractSandboxProcess } from '@/lib/process/sandbox-process.abstract';
import { ProcessOptions } from '@/lib/process/types';

export interface JobData {
  id: string;
}

export interface JobResult {
  id: string;
}

export class ExpirationEventsQueue extends AbstractSandboxProcess<JobData, JobResult> {
  constructor(db: Redis, options?: ProcessOptions) {
    super(db, `order-expiration`, `${__dirname}/worker.js`, options);
  }
}
