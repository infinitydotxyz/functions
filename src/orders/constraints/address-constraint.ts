import { OrderDirection } from '@infinityxyz/lib/types/core';
import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemCollectionAddressConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.collectionAddress === this.component.firestoreOrderItem.collectionAddress;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('collectionAddress', '==', this.component.firestoreOrderItem.collectionAddress);
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    query = query.orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.collectionAddress]
    };
  }
}
