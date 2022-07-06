import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

/**
 * require that the lister and offerer are different
 */
export class OrderItemDifferentWalletConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.makerAddress !== this.component.firestoreOrderItem.makerAddress;

    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [`Maker Addresses do not match ${orderItem.makerAddress} !== ${this.component.firestoreOrderItem.makerAddress}`]
    }
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query;
  }

  addOrderByToQuery(query: FirebaseFirestore.Query<FirestoreOrderItem>): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (item: FirestoreOrderItem) => (string | number)[];
  } {
    return {
      query,
      getStartAfter: () => []
    };
  }
}
