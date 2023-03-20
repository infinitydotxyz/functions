import PQueue from 'p-queue';

import { OrderEventKind, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { Flow } from '@reservoir0x/sdk';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, Query } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { Erc20ApprovalEventData } from '@/lib/on-chain-events/erc20/erc20-approval';
import { Erc20TransferEventData } from '@/lib/on-chain-events/erc20/erc20-transfer';
import { ContractEvent, ContractEventKind } from '@/lib/on-chain-events/types';

import { validateOrders } from './validate-orders';

export async function* erc20Transfers() {
  const db = getDb();
  const contractEvents = db.collectionGroup('contractEvents');

  const transfers = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.Erc20Transfer) as Query<ContractEvent<Erc20TransferEventData>>;

  const stream = streamQueryWithRef(transfers);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function* erc20ApprovalChanges() {
  const db = getDb();
  const contractEvent = db.collectionGroup('contractEvent');

  const approvalChanges = contractEvent
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.Erc20Approval) as Query<ContractEvent<Erc20ApprovalEventData>>;

  const stream = streamQueryWithRef(approvalChanges);
  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function handleErc20ApprovalEvents() {
  const iterator = erc20ApprovalChanges();

  const queue = new PQueue({ concurrency: 10 });
  for await (const item of iterator) {
    queue
      .add(async () => {
        const batch = new BatchHandler();

        if (item.data.event.spender === Flow.Addresses.Exchange[parseInt(item.data.baseParams.chainId, 10)]) {
          const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;

          /**
           * WETH approvals are required for bids only
           */
          const impactedOrdersQuery = ordersRef
            .where('metadata.source', '==', 'flow')
            .where('metadata.chainId', '==', item.data.baseParams.chainId)
            .where('order.isSellOrder', '==', false)
            .where('order.maker', '==', item.data.event.owner);

          /**
           * validate every impacted order
           */
          await validateOrders(impactedOrdersQuery, item.data, OrderEventKind.ApprovalChange, batch);
        }
        const contractEventMetadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...item.data.metadata,
          processed: true
        };

        await batch.addAsync(item.ref, { metadata: contractEventMetadataUpdate }, { merge: true });

        await batch.flush();
      })
      .catch((err) => {
        logger.error('indexer', `Failed to handle ERC20 approval event ${err}`);
      });
  }
}

export async function handleErc20TransferEvents() {
  const iterator = erc20Transfers();

  const queue = new PQueue({ concurrency: 10 });
  for await (const item of iterator) {
    queue
      .add(async () => {
        const batch = new BatchHandler();

        const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;

        /**
         * WETH balances are required for bids only
         */
        const fromOrdersQuery = ordersRef
          .where('metadata.source', '==', 'flow')
          .where('metadata.chainId', '==', item.data.baseParams.chainId)
          .where('order.isSellOrder', '==', false)
          .where('order.maker', '==', item.data.event.from);

        const toOrdersQuery = ordersRef
          .where('metadata.source', '==', 'flow')
          .where('metadata.chainId', '==', item.data.baseParams.chainId)
          .where('order.isSellOrder', '==', false)
          .where('order.maker', '==', item.data.event.to);

        /**
         * validate bids placed by the users involved
         */
        await validateOrders(fromOrdersQuery, item.data, OrderEventKind.BalanceChange, batch);
        await validateOrders(toOrdersQuery, item.data, OrderEventKind.BalanceChange, batch);
        const contractEventMetadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...item.data.metadata,
          processed: true
        };

        await batch.addAsync(item.ref, { metadata: contractEventMetadataUpdate }, { merge: true });

        await batch.flush();
      })
      .catch((err) => {
        logger.error('indexer', `Failed to handle ERC20 transfer event ${err}`);
      });
  }
}
