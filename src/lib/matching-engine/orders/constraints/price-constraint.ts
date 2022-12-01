import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';

import { getOrderIntersection } from '../../../utils/intersection';
import { OrderPriceIntersection } from '../../../utils/intersection.types';
import { OrderItemPrice, ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemPriceConstraint extends OrderItemConstraint {
  protected score = 0;

  public getIntersection(order: OrderItemPrice): OrderPriceIntersection | null {
    const intersection = getOrderIntersection(this.firestoreOrderItem, order);
    return intersection;
  }

  // note this does not check if the price is currently valid
  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const intersection = this.getIntersection(orderItem);
    if (intersection === null) {
      return {
        isValid: false,
        reasons: [`Prices do not intersect`]
      };
    }
    return {
      isValid: true
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
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
