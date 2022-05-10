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
}
