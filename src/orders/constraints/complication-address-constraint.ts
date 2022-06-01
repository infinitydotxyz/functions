import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemComplicationAddressConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.complicationAddress === this.component.firestoreOrderItem.complicationAddress;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query; // if the complication address changes we should add this as a query constraint
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
