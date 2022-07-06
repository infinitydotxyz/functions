import { FirestoreOrderItem, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { ValidationResponse } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemOrderStatusConstraint extends OrderItemConstraint {
  protected score = 0;

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): ValidationResponse{
    const isValid = orderItem.orderStatus === OBOrderStatus.ValidActive;
    if(isValid) {
      return {
        isValid
      };
    }
    return { 
      isValid,
      reasons: [`Order status of opposing order is not valid active ${orderItem.orderStatus}`]
    }
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query.where('orderStatus', '==', OBOrderStatus.ValidActive);
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
