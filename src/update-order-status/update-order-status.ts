import { FirestoreOrder, OBOrderStatus } from "@infinityxyz/lib/types/core";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import { getDb } from "firestore";

export const updateOrderStatus = async (
  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>,
  orderStatus: OBOrderStatus
): Promise<void> => {
  const orderItems = orderRef.collection(
    firestoreConstants.ORDER_ITEMS_SUB_COLL
  );
  const db = getDb();
  await db.runTransaction(async (tx) => {
    const orderItemsSnap = await tx.get(orderItems);
    for (const orderItemSnap of orderItemsSnap.docs) {
      tx.update(orderItemSnap.ref, { orderStatus });
    }
    tx.update(orderRef, { orderStatus });
  });
};
