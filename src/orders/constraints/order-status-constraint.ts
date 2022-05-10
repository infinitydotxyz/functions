import { FirestoreOrderItem, OBOrderStatus } from "@infinityxyz/lib/types/core";
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
}
