import { FirestoreOrderItem, OrderDirection } from '@infinityxyz/lib/types/core';

import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemEndTimeConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.endTimeMs >= this.component.firestoreOrderItem.startTimeMs;
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [
        `End time of opposing order ${orderItem.endTimeMs} is before start time of the main order ${this.component.firestoreOrderItem.startTimeMs}`
      ]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this instanceof this.firestoreQueryOrderByConstraint) {
      return query.where('endTimeMs', '>=', this.firestoreOrderItem.startTimeMs);
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
    query = query.orderBy('endTimeMs', orderDirection ?? OrderDirection.Ascending);
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem) => [item.endTimeMs]
    };
  }
}
