import { FirestoreOrderItem } from "@infinityxyz/lib/types/core";
import { OrderItemConstraint } from "./order-item-constraint.abstract";

export class OrderItemNumTokensConstraint extends OrderItemConstraint {
  protected score = 0;

  private get isNumTokensUpperBound(): boolean {
    return this.firestoreOrderItem.isSellOrder ? true : false;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    if (this.isNumTokensUpperBound) {
      return orderItem.numTokens <= this.firestoreOrderItem.numTokens;
    }
    return orderItem.numTokens >= this.component.firestoreOrderItem.numTokens;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query; // cannot add this constraint and startAfterTime
    // if (this.isNumTokensUpperBound) { // TODO handle this dynamically
    //   return query.where('numTokens', '<=', this.firestoreOrderItem.numTokens);
    // }
    // return query.where('numTokens', '>=', this.firestoreOrderItem.numTokens);
  }
}

