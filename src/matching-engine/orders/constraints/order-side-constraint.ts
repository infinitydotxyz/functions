import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';

import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemOrderSideConstraint extends OrderItemConstraint {
  protected score = 0;

  private get expectedOrderSide(): boolean {
    return !this.component.firestoreOrderItem.isSellOrder;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse {
    const isValid = orderItem.isSellOrder === this.expectedOrderSide;
    if (isValid) {
      return {
        isValid
      };
    }
    return {
      isValid,
      reasons: [
        `Order sides conflict opposing order side ${orderItem.isSellOrder ? 'listing' : 'offer'} main order side ${
          this.expectedOrderSide ? 'offer' : 'listing'
        }`
      ]
    };
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('isSellOrder', '==', this.expectedOrderSide);
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
