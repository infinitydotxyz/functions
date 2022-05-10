import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemEndTimeConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.endTimeMs >= this.component.firestoreOrderItem.startTimeMs;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this instanceof this.firestoreQueryOrderByConstraint) {
      return query.where('endTimeMs', '>=', this.firestoreOrderItem.startTimeMs);
    }
    return query;
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    query = query.orderBy('endTimeMs', orderDirection ?? OrderDirection.Ascending).orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.endTimeMs, item.collectionAddress]
    };
  }
}
