import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';
import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemStartTimeConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.startTimeMs <= this.component.firestoreOrderItem.endTimeMs;
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [
        `End time of main order ${this.component.firestoreOrderItem.endTimeMs} is less than the start time of opposing order ${orderItem.startTimeMs}`
      ]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this instanceof this.firestoreQueryOrderByConstraint) {
      return query.where('startTimeMs', '<=', this.firestoreOrderItem.endTimeMs);
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
    query = query.orderBy('startTimeMs', OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem, lastItem: FirebaseFirestore.DocumentReference<FirestoreOrderItem>) => [
        lastItem
      ]
    };
  }
}
