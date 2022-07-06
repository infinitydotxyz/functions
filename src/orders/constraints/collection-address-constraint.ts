import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemCollectionAddressConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    let isValid = true
    if (this.component.firestoreOrderItem.collectionAddress) {
      isValid = orderItem.collectionAddress === this.component.firestoreOrderItem.collectionAddress;
    }
    /**
     * if the order item doesn't specify a collection address
     * then it can be matched with any collection address
     */
    if(isValid) {
      return {
        isValid
      };
    }
    return {
      isValid, 
      reasons: [`Collection Addresses do not match ${orderItem.collectionAddress} !== ${this.component.firestoreOrderItem.collectionAddress}`]
    }
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this.component.firestoreOrderItem.collectionAddress) {
      return query.where('collectionAddress', '==', this.component.firestoreOrderItem.collectionAddress);
    }
    return query;
  }

  addOrderByToQuery(query: FirebaseFirestore.Query<FirestoreOrderItem>): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (
      item: FirestoreOrderItem,
      ref: FirebaseFirestore.DocumentReference<FirestoreOrderItem>
    ) => (string | number | FirebaseFirestore.DocumentReference<FirestoreOrderItem>)[];
  } {
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem, lastItem: FirebaseFirestore.DocumentReference<FirestoreOrderItem>) => [
        lastItem
      ]
    };
  }
}
