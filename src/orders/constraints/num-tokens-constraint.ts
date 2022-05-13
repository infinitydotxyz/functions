import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemNumTokensConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.numTokens == this.firestoreOrderItem.numTokens;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('numTokens', '==', this.firestoreOrderItem.numTokens);
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    const defaultOrderDirection = OrderDirection.Descending;
    query = query
      .orderBy('collectionAddress', orderDirection ?? defaultOrderDirection);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.collectionAddress]
    };
  }
}
