import { FirestoreOrder, FirestoreOrderItem, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../../firestore';
import { getErc721Owner } from '../../utils/ethersUtils';

export const updateOrderStatus = async (
  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>,
  orderStatus: OBOrderStatus,
  isSellOrder?: boolean
): Promise<void> => {
  const orderItems = orderRef.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL);
  const db = getDb();
  await db.runTransaction(async (tx) => {
    let shouldUpdateOrderStatus = true;
    const orderItemsSnap = await tx.get(orderItems);
    for (const orderItemSnap of orderItemsSnap.docs) {
      // if it is a sell order, only mark order as validActive if maker is still owner
      if (isSellOrder && orderStatus === OBOrderStatus.ValidActive) {
        const orderItemData = orderItemSnap.data() as FirestoreOrderItem;
        const maker = orderItemData?.makerAddress;
        const chainId = orderItemData?.chainId;
        const collectionAddress = orderItemData?.collectionAddress;
        const tokenId = orderItemData?.tokenId;
        const owner = await getErc721Owner({ address: collectionAddress, tokenId, chainId });
        if (owner === maker) {
          tx.update(orderItemSnap.ref, { orderStatus });
        } else {
          shouldUpdateOrderStatus = false;
        }
      } else {
        tx.update(orderItemSnap.ref, { orderStatus });
      }
    }
    if (shouldUpdateOrderStatus) {
      tx.update(orderRef, { orderStatus });
    }
  });
};
