import {FirestoreOrderItem, OrderItemSnippet, Token} from "@infinityxyz/lib/types/core";
import {firestoreConstants} from "@infinityxyz/lib/utils/constants";
import * as functions from "firebase-functions";
import {getDb} from "../firestore";
import {getBestOrder} from "./getBestOrder";
import {getNftRef} from "./getNftRef";
import {getRelevantOrderItemSnippet} from "./getRelevantOrderItemsSnippet";

export const addOrdersToNfts = functions.region('us-east1').firestore
    .document(`${firestoreConstants.ORDER_ITEMS_SUB_COLL}/{orderItemId}`)
    .onWrite(async (change) => {
      try {
        const db = getDb();
        await db.runTransaction(async (tx) => {
          const before = change.before.data() as FirestoreOrderItem;
          const after = change.after.data() as FirestoreOrderItem;
          const orderWasDeleted = !change.after.exists;
          const orderItem = orderWasDeleted ? before : after;

          const nftRef = getNftRef(orderItem);

          const nftSnap = await tx.get(nftRef);
          const nft = nftSnap.data() ?? {};

          const bestOrderDoc = await getBestOrder(
              {
                collectionAddress: orderItem.collectionAddress,
                chainId: orderItem.chainId,
                tokenId: orderItem.tokenId,
              },
              orderItem.isSellOrder,
              tx
          );
          const bestOrder = bestOrderDoc?.data?.() ?? null;

          const currentOrder = getRelevantOrderItemSnippet(orderItem, nft);

          let requiresUpdate = currentOrder?.orderItemId !== bestOrder?.id;
          if (!requiresUpdate) {
            for (const [key, value] of Object.entries(currentOrder ?? {})) {
              const fieldIsSame = value === ((bestOrder ?? {}) as Record<string, string | number>)?.[key];
              if (!fieldIsSame) {
                requiresUpdate = true;
                break;
              }
            }
          }

          if (!requiresUpdate) {
            return;
          }

          const updatedOrderItemSnippet: OrderItemSnippet = {
            hasOrder: !!bestOrder,
            orderItemId: bestOrder?.id ?? "",
            orderItem: bestOrder,
          };

          const fieldToUpdate = orderItem.isSellOrder ? "listing" : "offer";

          const updatedOrderSnippet: Pick<Token, "ordersSnippet"> = {
            ordersSnippet: {
              [fieldToUpdate]: updatedOrderItemSnippet,
            },
          };
          tx.set(nftSnap.ref, {...updatedOrderSnippet}, {mergeFields: [`ordersSnippet.${fieldToUpdate}`]});
        });
      } catch (err) {
        console.error(err);
        throw err;
      }
    });
