import PQueue from 'p-queue';

import { OrderEventKind, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { Flow } from '@reservoir0x/sdk';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, Query } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { Erc721ApprovalEventData } from '@/lib/on-chain-events/erc721/erc721-approval';
import { Erc721ApprovalForAllEventData } from '@/lib/on-chain-events/erc721/erc721-approval-for-all';
import { Erc721TransferEventData } from '@/lib/on-chain-events/erc721/erc721-transfer';
import { ContractEvent, ContractEventKind } from '@/lib/on-chain-events/types';

import { validateOrders } from './validate-orders';

export async function* erc721TransferEvents() {
  const db = getDb();
  const contractEvents = db.collectionGroup('contractEvents');

  const transfers = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.Erc721Transfer) as Query<
    ContractEvent<Erc721TransferEventData>
  >;

  const stream = streamQueryWithRef(transfers);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function* erc721ApprovalEvents() {
  const db = getDb();
  const contractEvents = db.collectionGroup('contractEvents');

  const transfers = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.Erc721Approval) as Query<
    ContractEvent<Erc721ApprovalEventData>
  >;

  const stream = streamQueryWithRef(transfers);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function* erc721ApprovalForAllEvents() {
  const db = getDb();
  const contractEvents = db.collectionGroup('contractEvents');

  const transfers = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.Erc721ApprovalForAll) as Query<
    ContractEvent<Erc721ApprovalForAllEventData>
  >;

  const stream = streamQueryWithRef(transfers);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function handleErc721ApprovalEvents() {
  const iterator = erc721ApprovalEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const item of iterator) {
    queue
      .add(async () => {
        const batch = new BatchHandler();

        if (item.data.event.approved === Flow.Addresses.Exchange[parseInt(item.data.baseParams.chainId, 10)]) {
          const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;

          /**
           * ERC721 approvals are required for asks
           *
           * this could be filtered by token id as well but might not be worth the additional index
           */
          const impactedOrdersQuery = ordersRef
            .where('metadata.chainId', '==', item.data.baseParams.chainId)
            .where('order.isSellOrder', '==', true)
            .where('order.maker', '==', item.data.event.owner)
            .where('order.collection', '==', item.data.baseParams.address);

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
        logger.error('indexer', `Failed to handle ERC721 approval event ${err}`);
      });
  }
}

export async function handleErc721ApprovalForAllEvents() {
  const iterator = erc721ApprovalForAllEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const item of iterator) {
    queue
      .add(async () => {
        const batch = new BatchHandler();

        if (item.data.event.operator === Flow.Addresses.Exchange[parseInt(item.data.baseParams.chainId, 10)]) {
          const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;

          /**
           * ERC721 approvals are required for asks
           */
          const impactedOrdersQuery = ordersRef
            .where('metadata.chainId', '==', item.data.baseParams.chainId)
            .where('order.isSellOrder', '==', true)
            .where('order.maker', '==', item.data.event.owner)
            .where('order.collection', '==', item.data.baseParams.address);

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
        logger.error('indexer', `Failed to handle ERC721 approval event ${err}`);
      });
  }
}

export async function handleErc721TransferEvents() {
  const iterator = erc721TransferEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const item of iterator) {
    queue
      .add(async () => {
        const batch = new BatchHandler();

        const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;

        /**
         * ERC721 transfers are required for asks
         *
         * this could be filtered by token id as well but might not be worth the additional index
         */
        const fromOrdersQuery = ordersRef
          .where('metadata.chainId', '==', item.data.baseParams.chainId)
          .where('order.isSellOrder', '==', true)
          .where('order.maker', '==', item.data.event.from)
          .where('order.collection', '==', item.data.baseParams.address);

        const toOrdersQuery = ordersRef
          .where('metadata.chainId', '==', item.data.baseParams.chainId)
          .where('order.isSellOrder', '==', true)
          .where('order.maker', '==', item.data.event.to)
          .where('order.collection', '==', item.data.baseParams.address);

        /**
         * validate every impacted order
         */
        await validateOrders(fromOrdersQuery, item.data, OrderEventKind.TokenOwnerUpdate, batch);
        await validateOrders(toOrdersQuery, item.data, OrderEventKind.TokenOwnerUpdate, batch);
        const contractEventMetadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...item.data.metadata,
          processed: true
        };

        await batch.addAsync(item.ref, { metadata: contractEventMetadataUpdate }, { merge: true });

        await batch.flush();
      })
      .catch((err) => {
        logger.error('indexer', `Failed to handle ERC721 transfer event ${err}`);
      });
  }
}
