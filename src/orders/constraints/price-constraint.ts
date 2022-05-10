import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { getOrderIntersection } from '../../utils/intersection';
import { OrderPriceIntersection } from '../../utils/intersection.types';
import { OrderItemPrice } from '../orders.types';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemPriceConstraint extends OrderItemConstraint {
  protected score = 0;

  public getIntersection(order: OrderItemPrice): OrderPriceIntersection {
    const intersection = getOrderIntersection(this.firestoreOrderItem, order);
    return intersection;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    const intersection = this.getIntersection(orderItem);
    if (intersection === null) {
      return false;
    }
    return true;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    return query; // cannot sort by both price
    // TODO handle this dynamically
  }
}
