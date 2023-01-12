import {
  ChainId,
  FirestoreOrder,
  OBOrderStatus,
  OrderCreatedEvent,
  OrderEventKind,
  OrderExpiredEvent
} from '@infinityxyz/lib/types/core';
import { OrderStatus } from '@infinityxyz/lib/types/dto';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';

async function main() {
  const db = getDb();
  const orders = db.collection('orders') as CollRef<FirestoreOrder>;

  const ordersStream = streamQueryWithRef(orders);

  let numValid = 0;
  let numInvalid = 0;
  const batch = new BatchHandler();
  for await (const { data } of ordersStream) {
    if (!data.id) {
      continue;
    }

    const orderEventsRef = db.collection('ordersV2').doc(data.id).collection('orderEvents');
    const getStatus: Record<OBOrderStatus, OrderStatus> = {
      [OBOrderStatus.ValidActive]: OrderStatus.Active,
      [OBOrderStatus.ValidInactive]: OrderStatus.Inactive,
      [OBOrderStatus.Invalid]: OrderStatus.Expired
    };

    const orderCreated: OrderCreatedEvent = {
      metadata: {
        id: `CREATED:${data.id}`,
        isSellOrder: data.isSellOrder,
        orderId: data.id,
        chainId: data.chainId as ChainId,
        processed: false,
        migrationId: 1,
        eventKind: OrderEventKind.Created,
        timestamp: Date.now(),
        updatedAt: Date.now(),
        eventSource: 'infinity-orderbook'
      },
      data: {
        isNative: true,
        order: {
          id: data.id,
          chainId: data.chainId as ChainId,
          updatedAt: Date.now(),
          isSellOrder: data.isSellOrder,
          createdAt: Date.now(),
          source: 'infinity',
          rawOrder: data.signedOrder,
          infinityOrderId: data.id,
          infinityOrder: data.signedOrder,
          isDynamic: data.startPriceEth === data.endPriceEth,
          gasUsage: '0'
        },
        status: getStatus[data.orderStatus]
      }
    };
    await batch.addAsync(orderEventsRef.doc(orderCreated.metadata.id), orderCreated, { merge: true });
    if (data.orderStatus === OBOrderStatus.ValidActive || data.orderStatus === OBOrderStatus.ValidInactive) {
      console.log(`Order: ${data.id} is valid. Status: ${data.orderStatus}`);
      numValid += 1;
    } else {
      const orderExpiredEvent: OrderExpiredEvent = {
        metadata: {
          id: `EXPIRED:${data.id}`,
          isSellOrder: data.isSellOrder,
          orderId: data.id,
          chainId: data.chainId as ChainId,
          processed: false,
          migrationId: 1,
          eventKind: OrderEventKind.Expired,
          timestamp: Date.now(),
          updatedAt: Date.now(),
          eventSource: 'infinity-orderbook'
        },
        data: {
          status: OrderStatus.Expired
        }
      };

      await batch.addAsync(orderEventsRef.doc(orderExpiredEvent.metadata.id), orderExpiredEvent, { merge: true });
      console.log(`Order: ${data.id} is invalid. Status: ${data.orderStatus}`);
      numInvalid += 1;
    }
  }

  await batch.flush();
  console.log(`Valid: ${numValid}, Invalid: ${numInvalid}`);
}

void main();
