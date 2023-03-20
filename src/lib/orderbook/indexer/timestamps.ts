import { OrderEventKind, OrderExpiredEvent, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';

export async function* iterateExpiredOrders() {
  const db = getDb();
  const ordersRef = db.collection('ordersV2') as CollRef<RawFirestoreOrderWithoutError>;
  const validExpiredOrders = ordersRef.where('order.isValid', '==', true).where('endTimeMs', '<', Date.now());

  const stream = streamQueryWithRef(validExpiredOrders);

  for await (const { data, ref } of stream) {
    yield { data, ref };
  }
}

export async function markOrdersAsExpired() {
  const iterator = iterateExpiredOrders();
  const batch = new BatchHandler();
  for await (const { data, ref } of iterator) {
    const evenTimestamp = Date.now();
    const expiredEvent: OrderExpiredEvent = {
      metadata: {
        eventKind: OrderEventKind.Expired,
        id: `FLOW:EXPIRED:${data.metadata.id}:${evenTimestamp}`,
        isSellOrder: data.order.isSellOrder,
        orderId: data.metadata.id,
        chainId: data.metadata.chainId,
        processed: false,
        migrationId: 1,
        timestamp: evenTimestamp,
        updatedAt: evenTimestamp,
        eventSource: 'infinity-orderbook'
      },
      data: {
        status: 'expired'
      }
    };

    const expiredEventRef = ref.collection('orderEvents').doc(expiredEvent.metadata.id);
    await batch.addAsync(expiredEventRef, expiredEvent, { merge: false });
  }

  await batch.flush();
}
