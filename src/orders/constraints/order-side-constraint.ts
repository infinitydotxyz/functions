import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemOrderSideConstraint extends OrderItemConstraint {
  protected score = 0;

  private get expectedOrderSide(): boolean {
    return !this.component.firestoreOrderItem.isSellOrder;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.isSellOrder === this.expectedOrderSide;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('isSellOrder', '==', this.expectedOrderSide);
  }
}
