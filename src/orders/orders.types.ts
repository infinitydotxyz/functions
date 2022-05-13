import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint as AbstractOrderItemConstraint } from './constraints/order-item-constraint.abstract';

export interface FirestoreOrderMatch {
  /**
   * id of the firestore order that is a match
   */
  id: string;

  /**
   * timestamp that the orders become valid
   * matches
   */
  timestamp: number;

  /**
   * the price of the match
   */
  price: number;

  /**
   * whether the match is active or not
   * timestamp >= Date.now()
   */
  status: 'inactive' | 'active';
}

export type OrderItemPrice = Pick<FirestoreOrderItem, 'startTimeMs' | 'endTimeMs' | 'startPriceEth' | 'endPriceEth'>;

export interface OrderItem {
  isAuction: boolean;

  constraintScore: number;

  firestoreOrderItem: FirestoreOrderItem;

  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>;

  db: FirebaseFirestore.Firestore;

  firestoreQueryOrderByConstraint: typeof AbstractOrderItemConstraint;

  isMatch(orderItem: FirestoreOrderItem): boolean;

  getPossibleMatches(
    queryWithConstraints?: FirebaseFirestore.Query<FirestoreOrderItem>
  ): AsyncGenerator<FirestoreOrderItem>;

  getNumConstraints(): number;
}

export type OrderItemMatch = { order: OrderItem; opposingOrder: OrderItem };
