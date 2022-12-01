import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemNumTokensConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.numTokens == this.firestoreOrderItem.numTokens;
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [`Num Tokens do not match ${orderItem.numTokens} !== ${this.firestoreOrderItem.numTokens}`]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('numTokens', '==', this.firestoreOrderItem.numTokens);
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
