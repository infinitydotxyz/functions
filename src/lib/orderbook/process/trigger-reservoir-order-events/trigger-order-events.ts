import Redis from 'ioredis';

import { ProcessOptions } from '@/lib/process/types';

import { ErrorCode } from '../../errors';
import { AbstractOrderbookProcessor } from '../orderbook-processor';

export interface JobData {
  id: string;
  queryNum: number;
  numQueries: number;
  errorCode: ErrorCode;
}

export interface JobResult {
  numOrderEvents: number;
}

export class TriggerReservoirOrderEventsProcessor extends AbstractOrderbookProcessor<JobData, JobResult> {
  constructor(id: string, redis: Redis, firestore: FirebaseFirestore.Firestore, options?: ProcessOptions) {
    super(id, redis, firestore, `${__dirname}/worker.js`, options);
  }
}
