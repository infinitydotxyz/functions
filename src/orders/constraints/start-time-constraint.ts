import { FirestoreOrderItem, OrderDirection } from "@infinityxyz/lib/types/core";
import { OrderItemConstraint } from "./order-item-constraint.abstract";

export class OrderItemStartTimeConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.startTimeMs <= this.component.firestoreOrderItem.endTimeMs;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this instanceof this.firestoreQueryOrderByConstraint) {
      return query.where('startTimeMs', '<=', this.firestoreOrderItem.endTimeMs);
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
    query = query.orderBy('startTimeMs', orderDirection ?? OrderDirection.Ascending).orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.startTimeMs, item.collectionAddress]
    };
  }
}
