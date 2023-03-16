import PQueue from 'p-queue';

import {
  OrderCancelledEvent,
  OrderEventKind,
  OrderStatus,
  RawFirestoreOrderWithoutError,
  UserNonce
} from '@infinityxyz/lib/types/core';
import { toNumericallySortedLexicographicStr } from '@infinityxyz/lib/utils';
import { Flow } from '@reservoir0x/sdk';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, DocRef, Query } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { CancelAllOrdersEventData } from '@/lib/on-chain-events/flow-exchange/cancel-all-orders';
import { CancelMultipleOrdersEventData } from '@/lib/on-chain-events/flow-exchange/cancel-multiple-orders';
import { ContractEvent, ContractEventKind } from '@/lib/on-chain-events/types';

import { getOrderStatus } from './validate-orders';

export async function* iterateCancelAllEvents() {
  const contractEvents = getDb().collectionGroup('contractEvents');

  const cancelAllEvents = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.FlowExchangeCancelAllOrders) as Query<
    ContractEvent<CancelAllOrdersEventData>
  >;

  const stream = streamQueryWithRef(cancelAllEvents);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function* iterateCancelMultipleEvents() {
  const contractEvents = getDb().collectionGroup('contractEvents');

  const cancelAllEvents = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.FlowExchangeCancelMultipleOrders) as Query<
    ContractEvent<CancelMultipleOrdersEventData>
  >;

  const stream = streamQueryWithRef(cancelAllEvents);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function handleCancelMultipleEvents() {
  const iterator = iterateCancelMultipleEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const { data, ref } of iterator) {
    handleNonces(queue, data, ref);

    if (queue.size > 300) {
      await queue.onEmpty();
    }
  }
}

export async function handleCancelAllEvents() {
  const iterator = iterateCancelAllEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const { data, ref } of iterator) {
    handleNonces(queue, data, ref);

    if (queue.size > 300) {
      await queue.onEmpty();
    }
  }
}

function handleNonces(
  queue: PQueue,
  data: ContractEvent<CancelMultipleOrdersEventData> | ContractEvent<CancelAllOrdersEventData>,
  ref: DocRef<ContractEvent<CancelMultipleOrdersEventData> | ContractEvent<CancelAllOrdersEventData>>
) {
  const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;
  const usersRef = getDb().collection('users');
  let nonces: string[];
  let queryType: 'max' | 'equal';
  if (data.metadata.eventKind === ContractEventKind.FlowExchangeCancelAllOrders) {
    nonces = [(data.event as CancelAllOrdersEventData).newMinNonce];
    queryType = 'max';
  } else {
    nonces = (data.event as CancelMultipleOrdersEventData).orderNonces;
    queryType = 'equal';
  }

  for (const nonce of nonces) {
    queue
      .add(async () => {
        const batch = new BatchHandler();
        const ordersToCancel = ordersRef
          .where('order.maker', '==', data.event.user)
          .where('order.nonce', queryType === 'max' ? '<' : '==', nonce);

        const userNoncesRef = usersRef.doc(data.event.user).collection('userNonces') as CollRef<UserNonce>;

        const formattedNonce = toNumericallySortedLexicographicStr(nonce, 256);
        const noncesToCancel = userNoncesRef
          .where('contractAddress', '==', data.baseParams.address)
          .where('nonce', queryType === 'max' ? '<' : '==', formattedNonce);
        const eventTimestamp = Date.now();

        /**
         * create order events to update the
         */
        for await (const order of streamQueryWithRef(ordersToCancel)) {
          let status: OrderStatus;
          if (data.metadata.reorged) {
            const flowOrder = new Flow.Order(
              parseInt(order.data.metadata.chainId, 10),
              order.data.rawOrder.infinityOrder as Flow.Types.SignedOrder
            );
            status = await getOrderStatus(flowOrder);
          } else {
            status = 'cancelled';
          }

          const orderEvent: OrderCancelledEvent = {
            metadata: {
              eventKind: OrderEventKind.Cancelled,
              /**
               * update the order event on reorgs
               */
              id: `FLOW:CANCELLED_MULTIPLE:${data.event.user}:${data.baseParams.txHash}:${data.baseParams.logIndex}`,
              isSellOrder: order.data.order.isSellOrder,
              orderId: order.data.metadata.id,
              chainId: order.data.metadata.chainId,
              processed: false,
              migrationId: 1,
              timestamp: data.baseParams.blockTimestamp * 1000,
              updatedAt: eventTimestamp,
              eventSource: 'infinity-orderbook'
            },
            data: {
              status,
              txHash: data.baseParams.txHash,
              txTimestamp: data.baseParams.blockTimestamp
            }
          };
          const orderEventRef = order.ref.collection('orderEvents').doc(orderEvent.metadata.id);
          await batch.addAsync(orderEventRef, orderEvent, { merge: false });
        }

        /**
         * update all nonces with the correct fillability state
         */
        for await (const { data: nonce, ref: nonceRef } of streamQueryWithRef(noncesToCancel)) {
          let fillability: UserNonce['fillability'];
          if (data.metadata.reorged) {
            const exchange = new Flow.Exchange(parseInt(data.baseParams.chainId, 10));
            const isValid = await exchange.contract.isNonceValid(nonce.userAddress, nonce.nonce);
            fillability = isValid ? 'fillable' : 'cancelled';
          } else {
            fillability = 'cancelled';
          }

          await batch.addAsync(nonceRef, { fillability }, { merge: true });
        }

        /**
         * mark the event as processed
         */
        const metadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...data.metadata,
          processed: true
        };
        await batch.addAsync(ref, { metadata: metadataUpdate }, { merge: true });
        await batch.flush();
      })
      .catch((err) => {
        logger.error('indexer', `Failed to mark orders as cancelled ${err}`);
      });
  }
}
