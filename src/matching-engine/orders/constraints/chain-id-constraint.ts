import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';

import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemChainIdConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.chainId === this.component.firestoreOrderItem.chainId;
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [`Chain Ids do not match ${orderItem.chainId} !== ${this.component.firestoreOrderItem.chainId}`]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('chainId', '==', this.component.firestoreOrderItem.chainId);
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
