import * as functions from 'firebase-functions';

import { FirestoreOrder, FirestoreOrderItem, OrderItemSnippet, Token } from '@infinityxyz/lib/types/core';
import { ChainOBOrderDto } from '@infinityxyz/lib/types/dto/orders';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

import { getBestNftOrder } from './get-best-nft-order';
import { getNftRef } from './get-nft-ref';
import { getRelevantOrderItemSnippet } from './get-relevant-order-item-snippet';

export const addOrdersToNfts = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.ORDERS_COLL}/{orderId}/${firestoreConstants.ORDER_ITEMS_SUB_COLL}/{orderItemId}`
  )
  .onWrite(async (change) => {
    try {
      const db = getDb();
      const before = change.before.data() as FirestoreOrderItem;
      const after = change.after.data() as FirestoreOrderItem;
      const orderWasDeleted = !change.after.exists;
      const orderItem = orderWasDeleted ? before : after;
      if (!orderItem.tokenId) {
        return; // TODO should we also add collection offers/listings to nfts?
      }

      await db.runTransaction(async (tx) => {
        const nftRef = getNftRef(orderItem);

        const nftSnap = await tx.get(nftRef);
        const nft = nftSnap.data() ?? {};

        const bestOrderDoc = await getBestNftOrder(
          {
            collectionAddress: orderItem.collectionAddress,
            chainId: orderItem.chainId,
            tokenId: orderItem.tokenId
          },
          orderItem.isSellOrder,
          tx
        );

        // don't include attributes
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { attributes, ...bestOrder } = bestOrderDoc?.data?.() ?? ({} as any);

        const currentOrder = getRelevantOrderItemSnippet(orderItem, nft);

        let requiresUpdate = currentOrder?.orderItemId !== bestOrder?.id;
        if (!requiresUpdate) {
          for (const [key, value] of Object.entries(currentOrder ?? {})) {
            const fieldIsSame = value === (bestOrder as Record<string, string | number>)?.[key];
            if (!fieldIsSame) {
              requiresUpdate = true;
              break;
            }
          }
        }

        if (!requiresUpdate) {
          return;
        }

        let signedOrder: ChainOBOrderDto = {} as any;
        if (bestOrder.id) {
          const orderRef = bestOrderDoc?.ref.parent.parent;
          const orderSnap = await orderRef?.get?.();
          const orderDoc = orderSnap?.data() as FirestoreOrder | undefined;
          signedOrder = orderDoc?.signedOrder ?? ({} as any);
        }

        const updatedOrderItemSnippet: OrderItemSnippet = {
          hasOrder: !!bestOrder.id,
          orderItemId: bestOrder?.id ?? '',
          orderItem: bestOrder,
          signedOrder
        };

        const fieldToUpdate = orderItem.isSellOrder ? 'listing' : 'offer';

        const updatedOrderSnippet: Pick<Token, 'ordersSnippet'> = {
          ordersSnippet: {
            [fieldToUpdate]: updatedOrderItemSnippet
          }
        };
        tx.set(nftSnap.ref, { ...updatedOrderSnippet }, { mergeFields: [`ordersSnippet.${fieldToUpdate}`] });
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
