import { BulkJobOptions } from 'bullmq';
import { BigNumber } from 'ethers';
import Redis from 'ioredis';

import { RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { CollRef } from '@/firestore/types';
import { AbstractSandboxProcess } from '@/lib/process/sandbox-process.abstract';
import { ProcessOptions } from '@/lib/process/types';

export abstract class AbstractOrderbookProcessor<
  T extends { id: string; queryNum: number },
  U
> extends AbstractSandboxProcess<T, U> {
  protected concurrency: number;
  constructor(
    id: string,
    redis: Redis,
    protected _firestore: FirebaseFirestore.Firestore,
    workerFile: string,
    options?: ProcessOptions
  ) {
    super(redis, id, workerFile, options);
    this.concurrency = this._workers.length;
  }

  get ref() {
    return this._firestore.collection(firestoreConstants.ORDERS_V2_COLL) as CollRef<RawFirestoreOrder>;
  }

  static getSplitQueries(query: FirebaseFirestore.Query<RawFirestoreOrder>, numQueries: number) {
    const max = BigNumber.from('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const queries = [];
    const len = max.toHexString().length;
    for (let i = 0; i < numQueries; i++) {
      const start = max.mul(i).div(numQueries).toHexString().padEnd(len, '0');
      const end = max
        .mul(i + 1)
        .div(numQueries)
        .toHexString();

      queries.push(query.where('__name__', '>=', start).where('__name__', '<=', end));
    }

    return queries;
  }

  async add(data: T | T[]): Promise<void> {
    const arr = Array.isArray(data) ? data : [data];
    const jobs: {
      name: string;
      data: T;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: item.id,
        data: item
      };
    });
    await this._queue.addBulk(jobs);
  }
}
