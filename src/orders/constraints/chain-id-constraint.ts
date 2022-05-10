import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderDirection } from '@infinityxyz/lib/types/core/Queries';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemChainIdConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    return orderItem.chainId === this.component.firestoreOrderItem.chainId;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('chainId', '==', this.component.firestoreOrderItem.chainId);
  }

  addOrderByToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>,
    orderDirection?: OrderDirection
  ): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    query = query
      .orderBy('chainId', orderDirection ?? OrderDirection.Ascending)
      .orderBy('collectionAddress', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.chainId, item.collectionAddress]
    };
  }
}
