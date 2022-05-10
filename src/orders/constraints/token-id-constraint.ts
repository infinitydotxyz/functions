import { FirestoreOrderItem } from "@infinityxyz/lib/types/core";
import { OrderItemConstraint } from "./order-item-constraint.abstract";

export class OrderItemTokenIdConstraint extends OrderItemConstraint {
  protected score = 100;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.tokenId === this.component.firestoreOrderItem.tokenId;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('tokenId', '==', this.component.firestoreOrderItem.tokenId);
  }
}
