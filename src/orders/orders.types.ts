import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItemConstraint as AbstractOrderItemConstraint } from './constraints/order-item-constraint.abstract';

export type OrderItemPrice = Pick<
  FirestoreOrderItem,
  'isSellOrder' | 'startTimeMs' | 'endTimeMs' | 'startPriceEth' | 'endPriceEth'
>;

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
