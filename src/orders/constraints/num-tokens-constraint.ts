import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

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
    if (this instanceof this.firestoreQueryOrderByConstraint) {
      if (this.isNumTokensUpperBound) {
        return query.where('numTokens', '<=', this.firestoreOrderItem.numTokens);
      }
      return query.where('numTokens', '>=', this.firestoreOrderItem.numTokens);
    }
    return query; // cannot add this constraint and startAfterTime
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    const defaultOrderDirection = this.isNumTokensUpperBound ? OrderDirection.Descending : OrderDirection.Ascending;
    query = query
      .orderBy('numTokens', orderDirection ?? defaultOrderDirection)
      .orderBy('collectionAddress', orderDirection ?? defaultOrderDirection);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.numTokens, item.collectionAddress]
    };
  }
}
