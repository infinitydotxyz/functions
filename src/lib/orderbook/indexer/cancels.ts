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
import { CancelAllOrdersEventData } from '@/lib/on-chain-events/flow-exchange/cancel-all-orders';
import { CancelMultipleOrdersEventData } from '@/lib/on-chain-events/flow-exchange/cancel-multiple-orders';
import { BaseParams, ContractEvent, ContractEventKind } from '@/lib/on-chain-events/types';

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
    await handleNonces(queue, data, ref);

    if (queue.size > 300) {
      await queue.onEmpty();
    }
  }

  await queue.onIdle();
}

export async function handleCancelAllEvents() {
  const iterator = iterateCancelAllEvents();

  const queue = new PQueue({ concurrency: 10 });
  for await (const { data, ref } of iterator) {
    await handleNonces(queue, data, ref);

    if (queue.size > 300) {
      await queue.onEmpty();
    }
  }

  await queue.onIdle();
}

async function handleNonces(
  queue: PQueue,
  data: ContractEvent<CancelMultipleOrdersEventData> | ContractEvent<CancelAllOrdersEventData>,
  ref: DocRef<ContractEvent<CancelMultipleOrdersEventData> | ContractEvent<CancelAllOrdersEventData>>
) {
  let nonces: { nonce: string; user: string; baseParams: BaseParams; metadata: ContractEvent<unknown>['metadata'] }[];
  let queryType: 'max' | 'equal';
  if (data.metadata.eventKind === ContractEventKind.FlowExchangeCancelAllOrders) {
    nonces = [
      {
        nonce: (data.event as CancelAllOrdersEventData).newMinNonce,
        baseParams: data.baseParams,
        metadata: data.metadata,
        user: data.event.user
      }
    ];
    queryType = 'max';
  } else {
    nonces = (data.event as CancelMultipleOrdersEventData).orderNonces.map((nonce) => {
      return { nonce, baseParams: data.baseParams, metadata: data.metadata, user: data.event.user };
    });
    queryType = 'equal';
  }
  const batch = new BatchHandler();
  await updateNonces(queue, batch, nonces, queryType);

  /**
   * mark the event as processed
   */
  const metadataUpdate: ContractEvent<unknown>['metadata'] = {
    ...data.metadata,
    processed: true
  };
  await batch.addAsync(ref, { metadata: metadataUpdate }, { merge: true });
  await batch.flush();
}

export function updateNonces(
  queue: PQueue,
  batch: BatchHandler,
  nonces: { nonce: string; user: string; baseParams: BaseParams; metadata: ContractEvent<unknown>['metadata'] }[],
  queryType: 'max' | 'equal'
): Promise<unknown> {
  const ordersRef = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;
  const usersRef = getDb().collection('users');

  return Promise.all(
    nonces.map(async ({ nonce, user, baseParams, metadata }) => {
      await queue.add(async () => {
        const ordersToCancel = ordersRef
          .where('metadata.source', '==', 'flow')
          .where('order.maker', '==', user)
          .where('order.nonce', queryType === 'max' ? '<' : '==', nonce);

        const userNoncesRef = usersRef.doc(user).collection('userNonces') as CollRef<UserNonce>;

        const formattedNonce = toNumericallySortedLexicographicStr(nonce, 256);
        const noncesToCancel = userNoncesRef
          .where('contractAddress', '==', baseParams.address)
          .where('nonce', queryType === 'max' ? '<' : '==', formattedNonce);
        const eventTimestamp = Date.now();

        /**
         * create order events to update the
         */
        for await (const order of streamQueryWithRef(ordersToCancel)) {
          let status: OrderStatus;
          if (metadata.reorged) {
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
              id: `FLOW:CANCELLED:${user}:${baseParams.txHash}:${baseParams.logIndex}`,
              isSellOrder: order.data.order.isSellOrder,
              orderId: order.data.metadata.id,
              chainId: order.data.metadata.chainId,
              processed: false,
              migrationId: 1,
              timestamp: baseParams.blockTimestamp * 1000,
              updatedAt: eventTimestamp,
              eventSource: 'infinity-orderbook'
            },
            data: {
              status,
              txHash: baseParams.txHash,
              txTimestamp: baseParams.blockTimestamp
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
          if (metadata.reorged) {
            const exchange = new Flow.Exchange(parseInt(baseParams.chainId, 10));
            const isValid = await exchange.contract.isNonceValid(nonce.userAddress, nonce.nonce);
            fillability = isValid ? 'fillable' : 'cancelled';
          } else {
            fillability = 'cancelled';
          }

          await batch.addAsync(nonceRef, { fillability }, { merge: true });
        }
      });
    })
  );
}
