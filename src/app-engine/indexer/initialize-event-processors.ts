import { nanoid } from 'nanoid';
import cron from 'node-cron';

import { redis } from '../redis';
import { Erc20ApprovalEventsQueue } from './erc20-approval';
import { Erc20TransferEventsQueue } from './erc20-transfer';
import { Erc721ApprovalEventsQueue } from './erc721-approval';
import { Erc721ApprovalForAllEventsQueue } from './erc721-approval-for-all';
import { Erc721TransferEventsQueue } from './erc721-transfer';
import { ExpirationEventsQueue } from './expiration';
import { FlowCancelAllEventsQueue } from './flow-cancel-all';
import { FlowCancelMultipleEventsQueue } from './flow-cancel-multiple';
import { FlowMatchOrderFulfilledEventsQueue } from './flow-match-order.ts';
import { FlowTakeOrderFulfilledEventsQueue } from './flow-take-order.ts';

export function initializeEventProcessors() {
  const queues = [
    Erc20ApprovalEventsQueue,
    Erc20TransferEventsQueue,
    Erc721ApprovalEventsQueue,
    Erc721ApprovalForAllEventsQueue,
    Erc721TransferEventsQueue,
    ExpirationEventsQueue,
    FlowCancelAllEventsQueue,
    FlowCancelMultipleEventsQueue,
    FlowMatchOrderFulfilledEventsQueue,
    FlowTakeOrderFulfilledEventsQueue
  ];

  const options = {
    enableMetrics: false,
    concurrency: 1,
    debug: true,
    attempts: 3
  };

  const promises: Promise<unknown>[] = [];
  for (const Queue of queues) {
    const queue = new Queue(redis, options);
    promises.push(queue.run());

    const trigger = async () => {
      await queue.add({
        id: nanoid()
      });
    };
    cron.schedule('*/15 * * * * *', async () => {
      await trigger();
    });
  }

  return promises;
}
