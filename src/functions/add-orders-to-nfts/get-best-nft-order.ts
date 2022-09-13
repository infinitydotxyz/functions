import { FirestoreOrderItem, OBOrderStatus, OrderDirection } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../../firestore';

export async function getBestNftOrder(
  nft: { collectionAddress: string; chainId: string; tokenId: string },
  isSellOrder: boolean,
  tx?: FirebaseFirestore.Transaction
): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem> | null> {
  const db = getDb();
  if (!nft.collectionAddress || !nft.chainId || !nft.tokenId) {
    return null;
  }

  const orderItemsGroup = db.collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL);
  const activeOrderItemsForNftQuery = orderItemsGroup
    .where('collectionAddress', '==', nft.collectionAddress)
    .where('chainId', '==', nft.chainId)
    .where('tokenId', '==', nft.tokenId)
    .where('isSellOrder', '==', isSellOrder)
    .where('orderStatus', '==', OBOrderStatus.ValidActive);

  const bestListingOrderDirection = OrderDirection.Ascending;
  const bestOfferOrderDirection = OrderDirection.Descending;

  const directionForBestOrder = isSellOrder ? bestListingOrderDirection : bestOfferOrderDirection;

  const bestOrderQuery = activeOrderItemsForNftQuery
    .orderBy('startPriceEth', directionForBestOrder) // TODO how do we handle auctions?
    .orderBy('startTimeMs', OrderDirection.Ascending)
    .limit(1) as FirebaseFirestore.Query<FirestoreOrderItem>;

  let bestOrdersSnap: FirebaseFirestore.QuerySnapshot<FirestoreOrderItem>;
  if (tx) {
    bestOrdersSnap = await tx.get(bestOrderQuery);
  } else {
    bestOrdersSnap = await bestOrderQuery.get();
  }

  const bestOrderDoc = bestOrdersSnap.docs?.[0];
  return bestOrderDoc ?? null;
}
