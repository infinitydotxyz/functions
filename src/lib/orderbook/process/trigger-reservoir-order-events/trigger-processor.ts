import { Job } from 'bullmq';
import Redis from 'ioredis';

import { FirestoreDisplayOrder, RawFirestoreOrder } from '@infinityxyz/lib/types/core';
import { sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { Orderbook } from '@/lib/index';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';
import { getProvider } from '@/lib/utils/ethersUtils';

import { BaseOrder } from '../../order/base-order';

export interface JobData {
  id: string;
  data: ReservoirOrderEvent;
  path: string;
  reason: string;
}

export interface JobResult {
  id: string;
}

export class ReservoirOrderEventTrigger extends AbstractProcess<JobData, JobResult> {
  static queueName = 'reservoir-order-event-trigger';

  constructor(
    redis: Redis,
    protected _firestore: FirebaseFirestore.Firestore,
    protected _supportedCollectionsProvider: SupportedCollectionsProvider,
    options?: ProcessOptions
  ) {
    super(redis, ReservoirOrderEventTrigger.queueName, options);
  }

  async processJob(job: Job<JobData, JobResult, string>): Promise<JobResult> {
    const { id, data, path, reason } = job.data;

    const ref = this._firestore.doc(path);
    const contract = data?.data?.order?.contract;
    const source = (data?.data?.order?.source ?? '').toLowerCase();
    if (
      !this._supportedCollectionsProvider.has(`${data.metadata.chainId}:${contract}`) &&
      source !== 'infinity' &&
      source !== 'flow'
    ) {
      this.log(`Found unsupported order ${ref.path} - Deleting`);
      const orderRef = ref.parent.parent as DocRef<RawFirestoreOrder>;
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        await this._firestore.recursiveDelete(orderRef);
      } else {
        const provider = getProvider(data.metadata.chainId);
        const gasSimulator = new Orderbook.Orders.GasSimulator(provider, config.orderbook.gasSimulationAccount);
        const baseOrder = new BaseOrder(
          data.metadata.id,
          data.metadata.chainId,
          data.metadata.isSellOrder,
          this._firestore,
          provider,
          gasSimulator
        );

        const chainDisplayRef = this._firestore
          .collection('ordersV2ByChain')
          .doc(data.metadata.chainId)
          .collection('chainV2Orders')
          .doc(data.metadata.id) as DocRef<FirestoreDisplayOrder>;

        const displayOrderSnap = await chainDisplayRef.get();
        const displayOrder = displayOrderSnap.data();
        if (displayOrder) {
          await baseOrder.delete(displayOrder);
        } else {
          await this._firestore.recursiveDelete(orderRef);
        }
      }
    } else {
      data.data.order.contract;
      await ref.set(
        {
          metadata: {
            ...data.metadata,
            processed: false,
            hasError: false
          },
          error: null
        },
        { merge: true }
      );

      this.log(`Triggering event ${ref.path} - ${reason}`);
    }
    await sleep(200);

    return { id };
  }
}
