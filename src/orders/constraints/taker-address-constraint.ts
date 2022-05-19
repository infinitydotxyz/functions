import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class TakerAddressConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    if (this.firestoreOrderItem.takerAddress) {
      return this.firestoreOrderItem.takerAddress === orderItem.makerAddress;
    }
    return true;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this.firestoreOrderItem.takerAddress) {
      return query.where('makerAddress', '==', this.firestoreOrderItem.takerAddress);
    }
    return query;
  }

  addOrderByToQuery(query: FirebaseFirestore.Query<FirestoreOrderItem>): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (
      item: FirestoreOrderItem,
      ref: FirebaseFirestore.DocumentReference<FirestoreOrderItem>
    ) => (string | number | FirebaseFirestore.DocumentReference<FirestoreOrderItem>)[];
  } {
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem, lastItem: FirebaseFirestore.DocumentReference<FirestoreOrderItem>) => [
        lastItem
      ]
    };
  }
}
