import { FirestoreOrderItem, OBOrderStatus, OrderDirection } from "@infinityxyz/lib/types/core";
import { OrderItemConstraint } from "./order-item-constraint.abstract";

export class OrderItemOrderStatusConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.orderStatus === OBOrderStatus.ValidActive;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('orderStatus', '==', OBOrderStatus.ValidActive);
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    query = query.orderBy('orderStatus', orderDirection ?? OrderDirection.Ascending).orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.orderStatus, item.collectionAddress]
    };
  }
}
