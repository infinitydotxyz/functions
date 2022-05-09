import { OrderDirection } from "@infinityxyz/lib/types/core";
import {
  FirestoreOrder,
  FirestoreOrderItem,
} from "@infinityxyz/lib/types/core/OBOrder";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import { getDb } from "../firestore";
import { FirestoreOrderMatch } from "./orders.types";

export class Order {
  public get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return this.db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(this.firestoreOrder.id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  private db: FirebaseFirestore.Firestore;

  constructor(private firestoreOrder: FirestoreOrder) {
    this.db = getDb();
  }

  public async searchForMatches(): Promise<FirestoreOrderMatch[]> {
    /**
     * get order items
     */
    await this.getFirestoreOrderItems();


    /**
     * search for an orders that fulfill all order items 
     * 
     * pick the most restrictive order item, search for order items that fulfill that order item
     * for each order that fulfills the order item, check if all other order items can be fulfilled by that order
     */
    // TODO
    throw new Error('not yet implemented');
  }

  

  private async getFirestoreOrderItems(): Promise<FirestoreOrderItem[]> {
    const docs = await this.getFirestoreOrderItemDocs();
    const orderItems = docs.map((doc) => doc.data());
    return orderItems;
  }

  private async getFirestoreOrderItemDocs(): Promise<
    FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[]
  > {
    const orderItems = await this.ref
      .collection(firestoreConstants.ORDER_ITEMS_SUB_COLL)
      .get();
    return orderItems.docs as FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[];
  }

  async *getExistingMatches(validOnly: boolean): AsyncGenerator<FirestoreOrder> {
    const matchesWithTimestampBefore = validOnly
      ? Date.now()
      : Number.MAX_SAFE_INTEGER;
    let startAfterTimestamp = 0;
    let hasNextPage = true;
    const pageSize = 10;
    const getPage = async () => {
      const matches = this.ref
        .collection("orderMatches")
        .where("timestamp", "<=", matchesWithTimestampBefore)
        .orderBy("timestamp", OrderDirection.Ascending)
        .startAfter(
          startAfterTimestamp
        ) as FirebaseFirestore.Query<FirestoreOrderMatch>;
      const page = await matches.limit(pageSize).get();
      const docs = page.docs.map((doc) => doc.data());
      hasNextPage = docs.length >= pageSize;
      startAfterTimestamp = docs[docs.length - 1].timestamp;
      return docs;
    };
    while (hasNextPage) {
      const page = await getPage();
      const firestoreOrderRefs = page.map((match) => this.db.collection(firestoreConstants.ORDERS_COLL).doc(match.id));
      if(firestoreOrderRefs.length > 0) {
        const firestoreOrders = await this.db.getAll(...firestoreOrderRefs);
        for(const orderDoc of firestoreOrders) {
          const order = orderDoc.data() as FirestoreOrder;
          if(order) {
            yield order;
          }
        }        
      }
    }
  }
}
