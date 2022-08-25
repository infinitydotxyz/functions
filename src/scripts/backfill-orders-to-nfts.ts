import Emitter from 'events';
import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { OrderItemSnippet, Token } from '@infinityxyz/lib/types/core/Token';
import { getBestNftOrder } from '../functions/add-orders-to-nfts/get-best-nft-order';
import { getNftRef } from '../functions/add-orders-to-nfts/get-nft-ref';
import { getRelevantOrderItemSnippet } from '../functions/add-orders-to-nfts/get-relevant-order-item-snippet';
import { getDb } from '../firestore';

async function main() {
  console.log('Backfilling orders...');
  const emitter = new Emitter();
  try {
    registerLogger(emitter);
    await backfillOrders(emitter);
    console.log('Backfilled orders');
  } catch (err) {
    console.error(err);
  }
}

function registerLogger(emitter: Emitter) {
  let totalOrders = 0;
  let lastLog = 0;
  const log = () => {
    if (lastLog > Date.now() + 5_000) {
      lastLog = Date.now();
      console.log(`Backfilled: ${totalOrders}`);
    }
  };

  emitter.on('order', () => {
    totalOrders += 1;
    log();
  });
}

void main();

export async function backfillOrders(emitter: Emitter): Promise<void> {
  const db = getDb();

  const orderItemsQuery = db.collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL);
  const orderItems = orderItemsQuery.stream();

  for await (const snap of orderItems) {
    const orderItemSnap = snap as unknown as FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>;
    const orderItem = orderItemSnap.data();

    const bestOrderDoc = await getBestNftOrder(
      {
        collectionAddress: orderItem.collectionAddress,
        chainId: orderItem.chainId,
        tokenId: orderItem.tokenId
      },
      orderItem.isSellOrder
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { attributes, ...bestOrder } = bestOrderDoc?.data() ?? ({} as any);
    if (bestOrder && bestOrderDoc?.id) {
      const nftRef = getNftRef(bestOrder);
      const nftSnap = await nftRef.get();
      const nft = nftSnap.data();
      if (nft) {
        const bestOrderSaved = getRelevantOrderItemSnippet(bestOrder, nft);
        if (bestOrderSaved?.orderItemId !== bestOrderDoc.id) {
          const orderSnap = await bestOrderDoc.ref.parent.parent?.get();
          const signedOrder = orderSnap?.data()?.signedOrder ?? {};
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
          console.log(updatedOrderSnippet);
          await nftRef.set({ ...updatedOrderSnippet }, { mergeFields: [`ordersSnippet.${fieldToUpdate}`] });
        }
      }
    }
    emitter.emit('order');
  }
}
