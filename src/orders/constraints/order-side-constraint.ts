import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
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

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    query = query.orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.collectionAddress]
    };
  }
}
