import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';

import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemTakerAddressConstraint extends OrderItemConstraint {
  protected get score() {
    if (this.firestoreOrderItem.takerAddress) {
      return 1;
    }
    return 0;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    let isValid = true;
    if (this.firestoreOrderItem.takerAddress) {
      isValid = this.firestoreOrderItem.takerAddress === orderItem.makerAddress;
    }
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [
        `Taker Address ${this.firestoreOrderItem.takerAddress} does not match opposing order maker address ${orderItem.makerAddress}`
      ]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this.firestoreOrderItem.takerAddress) {
      return query.where('makerAddress', '==', this.firestoreOrderItem.takerAddress);
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
