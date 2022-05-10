import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemTokenIdConstraint extends OrderItemConstraint {
  protected score = 100;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    if (this.component.firestoreOrderItem.tokenId) {
      return orderItem.tokenId === this.component.firestoreOrderItem.tokenId;
    }
    return true;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this.component.firestoreOrderItem.tokenId) {
      return query.where('tokenId', '==', this.component.firestoreOrderItem.tokenId);
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
    query = query
      .orderBy('tokenId', orderDirection ?? OrderDirection.Ascending)
      .orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.tokenId, item.collectionAddress]
    };
  }
}
