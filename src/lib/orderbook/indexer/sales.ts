import { BigNumber } from 'ethers';
import PQueue from 'p-queue';

import {
  NftSale,
  OrderEventKind,
  OrderSaleEvent,
  OrderStatus,
  RawFirestoreOrderWithoutError,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import { PROTOCOL_FEE_BPS, formatEth, sleep } from '@infinityxyz/lib/utils';
import { Flow } from '@reservoir0x/sdk';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef, Query } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { MatchOrderFulfilledEventData } from '@/lib/on-chain-events/flow-exchange/match-order-fulfilled';
import { TakeOrderFulfilledEventData } from '@/lib/on-chain-events/flow-exchange/take-order-fulfilled';
import { BaseParams, ContractEvent, ContractEventKind } from '@/lib/on-chain-events/types';

import { updateNonces } from './cancels';
import { getOrderStatus } from './validate-orders';

export async function* iterateMatchOrderFulfilledEvents() {
  const contractEvents = getDb().collectionGroup('contractEvents');

  const matchOrderFulfilledEvents = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.FlowExchangeMatchOrderFulfilled) as Query<
    ContractEvent<MatchOrderFulfilledEventData>
  >;

  const stream = streamQueryWithRef(matchOrderFulfilledEvents);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function* iterateTakeOrderFulfilledEvents() {
  const contractEvents = getDb().collectionGroup('contractEvents');

  const takeOrderFulfilledEvents = contractEvents
    .where('metadata.processed', '==', false)
    .where('metadata.eventKind', '==', ContractEventKind.FlowExchangeTakeOrderFulfilled) as Query<
    ContractEvent<TakeOrderFulfilledEventData>
  >;

  const stream = streamQueryWithRef(takeOrderFulfilledEvents);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function handleMatchOrderFilledEvents(signal?: { abort: boolean }) {
  const iterator = iterateMatchOrderFulfilledEvents();

  const queue = new PQueue({ concurrency: 30 });
  const batch = new BatchHandler(100);
  for await (const { data, ref } of iterator) {
    queue
      .add(async () => {
        if (signal?.abort) {
          return;
        }
        const nonces: {
          nonce: string;
          user: string;
          baseParams: BaseParams;
          metadata: ContractEvent<unknown>['metadata'];
        }[] = [
          {
            nonce: data.event.buyOrderNonce,
            user: data.event.buyer,
            baseParams: data.baseParams,
            metadata: data.metadata
          },
          {
            nonce: data.event.sellOrderNonce,
            user: data.event.seller,
            baseParams: data.baseParams,
            metadata: data.metadata
          }
        ];

        await updateNonces(batch, nonces, 'equal');

        const sellOrderData = {
          orderHash: data.event.sellOrderHash,
          baseParams: data.baseParams,
          metadata: data.metadata
        };

        const buyOrderData = {
          orderHash: data.event.buyOrderHash,
          baseParams: data.baseParams,
          metadata: data.metadata
        };
        await handleOrderFilled(batch, sellOrderData);
        await handleOrderFilled(batch, buyOrderData);
        await saveSales(data);

        const metadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...data.metadata,
          processed: true
        };

        await batch.addAsync(ref, { metadata: metadataUpdate }, { merge: true });
      })
      .catch((err) => {
        logger.error('sales-handler', `Error processing match order fulfilled events ${err.message}`);
      });

    if (signal?.abort) {
      break;
    }
    if (queue.size > 500) {
      while (queue.size > 100) {
        await sleep(200);
      }
    }
  }

  await queue.onIdle();
  await batch.flush();
}

export async function handleTakeOrderFilledEvents(signal?: { abort: boolean }) {
  const iterator = iterateTakeOrderFulfilledEvents();

  const queue = new PQueue({ concurrency: 30 });
  const batch = new BatchHandler();
  for await (const { data, ref } of iterator) {
    queue
      .add(async () => {
        if (signal?.abort) {
          return;
        }
        const nonces: {
          nonce: string;
          user: string;
          baseParams: BaseParams;
          metadata: ContractEvent<unknown>['metadata'];
        }[] = [
          {
            nonce: data.event.nonce,
            user: data.event.buyer,
            baseParams: data.baseParams,
            metadata: data.metadata
          }
        ];

        await updateNonces(batch, nonces, 'equal');

        const orderData = {
          orderHash: data.event.orderHash,
          baseParams: data.baseParams,
          metadata: data.metadata
        };
        await handleOrderFilled(batch, orderData);
        await saveSales(data);

        const metadataUpdate: ContractEvent<unknown>['metadata'] = {
          ...data.metadata,
          processed: true
        };

        await batch.addAsync(ref, { metadata: metadataUpdate }, { merge: true });
      })
      .catch((err) => {
        logger.error('sales-handler', `Error handling take order filled event: ${err}`);
      });
    if (signal?.abort) {
      break;
    }
    if (queue.size > 500) {
      while (queue.size > 100) {
        await sleep(200);
      }
    }
  }
  await queue.onIdle();
  await batch.flush();
}

async function saveSales(
  data: ContractEvent<MatchOrderFulfilledEventData> | ContractEvent<TakeOrderFulfilledEventData>
) {
  if (data.metadata.commitment !== 'finalized') {
    // skip until the sale has been finalized
    return;
  }
  const db = getDb();
  const salesColl = db.collection('sales') as CollRef<NftSale>;
  await db.runTransaction(async (txn) => {
    const txnSalesQuery = salesColl.where('txHash', '==', data.baseParams.txHash).where('source', '==', 'flow');
    const txnSalesSnap = await txn.get(txnSalesQuery);

    if (!txnSalesSnap.empty) {
      // already saved (scraped from reservoir)
      return;
    }

    const nfts = data.event.nfts.flatMap(({ collection, tokens }) => {
      return tokens.map(({ tokenId, numTokens }) => {
        return {
          collection,
          tokenId,
          numTokens
        };
      });
    });
    const pricePerTokenWei = BigNumber.from(data.event.amount).div(nfts.length);
    const pricePerTokenEth = formatEth(pricePerTokenWei.toString());
    const sales = nfts.map((nft, index) => {
      const id = `${data.baseParams.txHash}:${data.baseParams.logIndex}:${index}`;
      const protocolFeeWei = BigNumber.from(pricePerTokenWei).div(nfts.length).mul(PROTOCOL_FEE_BPS).div(10000);
      const protocolFeeEth = formatEth(protocolFeeWei.toString());
      const sale: NftSale = {
        chainId: data.baseParams.chainId,
        txHash: data.baseParams.txHash,
        blockNumber: data.baseParams.block,
        timestamp: data.baseParams.blockTimestamp * 1000,
        collectionAddress: nft.collection,
        tokenId: nft.tokenId,
        price: pricePerTokenEth,
        paymentToken: data.event.currency,
        buyer: data.event.buyer,
        seller: data.event.seller,
        quantity: nft.numTokens,
        source: 'flow',
        isAggregated: false,
        isDeleted: false,
        isFeedUpdated: true,
        tokenStandard: TokenStandard.ERC721,
        protocolFeeBPS: PROTOCOL_FEE_BPS,
        protocolFee: protocolFeeEth,
        protocolFeeWei: protocolFeeWei.toString()
      };

      return {
        sale,
        id
      };
    });

    for (const { sale, id } of sales) {
      txn.set(salesColl.doc(id), sale);
    }
  });
}

async function handleOrderFilled(
  batch: BatchHandler,
  order: {
    orderHash: string;
    baseParams: BaseParams;
    metadata: ContractEvent<unknown>['metadata'];
  }
) {
  const orders = getDb().collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;
  const orderRef = orders.doc(order.orderHash);

  const orderSnap = await orderRef.get();

  const orderData = orderSnap.data() as RawFirestoreOrderWithoutError;

  if (!orderData || !orderData.rawOrder?.infinityOrder || !orderData.order) {
    logger.warn('indexer', `Order ${order.orderHash} not found`);
    return;
  }

  let status: OrderStatus;
  if (order.metadata.reorged) {
    const flowOrder = new Flow.Order(
      parseInt(orderData.metadata.chainId, 10),
      orderData.rawOrder.infinityOrder as Flow.Types.SignedOrder
    );

    status = await getOrderStatus(flowOrder);
  } else {
    status = 'filled';
  }

  const orderEventsRef = orderRef.collection('orderEvents');

  const orderFilledEvent: OrderSaleEvent = {
    metadata: {
      eventKind: OrderEventKind.Sale,
      id: `FLOW:FILLED:${order.baseParams.txHash}:${order.baseParams.logIndex}`,
      isSellOrder: orderData.order.isSellOrder,
      orderId: order.orderHash,
      chainId: order.baseParams.chainId,
      processed: false,
      migrationId: 1,
      timestamp: order.baseParams.blockTimestamp * 1000,
      updatedAt: Date.now(),
      eventSource: 'infinity-orderbook'
    },
    data: {
      status,
      txHash: order.baseParams.txHash,
      txTimestamp: order.baseParams.blockTimestamp
    }
  };

  await batch.addAsync(orderEventsRef.doc(orderFilledEvent.metadata.id), orderFilledEvent, { merge: true });
}
