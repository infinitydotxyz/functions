import { FirestoreOrderItem } from "@infinityxyz/lib/types/core";
import { OrderItemConstraint } from "./order-item-constraint.abstract";

export class OrderItemStartTimeConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.startTimeMs <= this.component.firestoreOrderItem.endTimeMs;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('startTimeMs', '<=', this.firestoreOrderItem.endTimeMs); // TODO add order by
  }
}
