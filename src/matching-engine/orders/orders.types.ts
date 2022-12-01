import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint as AbstractOrderItemConstraint } from './constraints/order-item-constraint.abstract';

export type OrderItemPrice = Pick<
  FirestoreOrderItem,
  'isSellOrder' | 'startTimeMs' | 'endTimeMs' | 'startPriceEth' | 'endPriceEth'
>;

export type ValidMatch = {
  isValid: true;
};

export type InvalidMatch = {
  isValid: false;
  reasons: string[];
};

export type ValidationResponse = ValidMatch | InvalidMatch;

export interface OrderItem {
  isAuction: boolean;

  /**
   * a randomly generated id for the order item
   * - generated when class is constructed and is not deterministic
   */
  id: string;

  constraintScore: number;

  firestoreOrderItem: FirestoreOrderItem;

  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>;

  db: FirebaseFirestore.Firestore;

  maxNumItemsContribution: number;

  firestoreQueryOrderByConstraint: typeof AbstractOrderItemConstraint;

  isMatch(orderItem: FirestoreOrderItem): ValidationResponse;

  getPossibleMatches(
    queryWithConstraints?: FirebaseFirestore.Query<FirestoreOrderItem>,
    pageSize?: number
  ): AsyncGenerator<FirestoreOrderItem>;

  getNumConstraints(): number;
}

export type OrderItemMatch = { orderItem: OrderItem; opposingOrderItem: OrderItem };
export type OneToManyOrderItemMatch = { orderItem: OrderItem; opposingOrderItems: OrderItem[] };
