import { OrderDirection } from '@infinityxyz/lib/types/core';
import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb, streamQuery } from '../firestore';
import { OrderItem } from './order-item';
import { FirestoreOrderMatch } from './orders.types';

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
    const orderItems = await this.getOrderItems();

    /**
     * search for an orders that fulfill all order items
     *
     * pick the most restrictive order item, search for order items that fulfill that order item
     * for each order that fulfills the order item, check if all other order items can be fulfilled by that order
     */
    // TODO
    throw new Error('not yet implemented');
  }

  private async getOrderItems(): Promise<OrderItem[]> {
    const firestoreOrderItems = await this.getFirestoreOrderItems();

    const orderItems = firestoreOrderItems.map((firestoreOrderItem) => {
      return new OrderItem(firestoreOrderItem, this.db);
    });

    return orderItems;
  }


  private async getFirestoreOrderItems(): Promise<FirestoreOrderItem[]> {
    const docs = await this.getFirestoreOrderItemDocs();
    const orderItems = docs.map((doc) => doc.data());
    return orderItems;
  }

  private async getFirestoreOrderItemDocs(): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[]> {
    const orderItems = await this.ref.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL).get();
    return orderItems.docs as FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[];
  }

  getExistingMatches(validOnly: boolean): AsyncGenerator<FirestoreOrder> {
    const matchesWithTimestampBefore = validOnly ? Date.now() : Number.MAX_SAFE_INTEGER;

    const matches = this.ref
      .collection('orderMatches')
      .where('timestamp', '<=', matchesWithTimestampBefore)
      .orderBy('timestamp', OrderDirection.Ascending) as FirebaseFirestore.Query<FirestoreOrderMatch>;

    const transformPage = async (page: FirestoreOrderMatch[]): Promise<FirestoreOrder[]> => {
      const firestoreOrderRefs = page.map((match) => this.db.collection(firestoreConstants.ORDERS_COLL).doc(match.id));
      if (firestoreOrderRefs.length > 0) {
        const firestoreOrders = await this.db.getAll(...firestoreOrderRefs);
        return firestoreOrders.map((item) => item.data() as FirestoreOrder);
      }
      return [];
    };

    const getStartAfterField = (item: FirestoreOrderMatch) => item.timestamp;
    return streamQuery<FirestoreOrderMatch, FirestoreOrder>(matches, getStartAfterField, {
      pageSize: 10,
      transformPage
    });
  }
}
