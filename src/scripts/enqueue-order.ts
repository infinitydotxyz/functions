
import { firestoreConstants } from "@infinityxyz/lib/utils";
import { getDb } from "../firestore";

export async function enqueueOrder(id: string) {
    const db = getDb();
    await db.collection(firestoreConstants.ORDERS_COLL).doc(id).set({ enqueued: true }, { merge: true });
}

void enqueueOrder('0x6e5f8fb9c74b175c172ed74a3f302255441449098ff0bfd9d89a6c85d4e4ca8e')