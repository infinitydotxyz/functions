import { nanoid } from 'nanoid';

import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { streamQuery } from '../../firestore/stream-query';
import { Constraint, constraints } from './constraints/constraint.types';
import { OrderItemConstraint } from './constraints/order-item-constraint.abstract';
import { OrderItemStartTimeConstraint } from './constraints/start-time-constraint';
import { OrderItem as IOrderItem, ValidationResponse } from './orders.types';

export class OrderItem implements IOrderItem {
  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>;

  public firestoreQueryOrderByConstraint: Constraint = OrderItemStartTimeConstraint;

  public readonly id: string;

  /**
   * provides access to the order item with constraints applied
   */
  public wrapper: IOrderItem;

  constructor(public readonly firestoreOrderItem: FirestoreOrderItem, public readonly db: FirebaseFirestore.Firestore) {
    this.orderRef = this.db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(this.firestoreOrderItem.id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
    this.id = nanoid();
  }

  public applyConstraints(): IOrderItem {
    let orderItem: IOrderItem | undefined = undefined;
    for (const Constraint of constraints) {
      orderItem = new Constraint(orderItem ?? this);
    }
    orderItem = orderItem ?? this;
    this.wrapper = orderItem;
    return this.wrapper;
  }

  public get isAuction(): boolean {
    return this.firestoreOrderItem.startPriceEth !== this.firestoreOrderItem.endPriceEth;
  }

  public get constraintScore(): number {
    return 0;
  }

  public get maxNumItemsContribution(): number {
    const isFullySpecified = !!this.firestoreOrderItem.tokenId;
    if (isFullySpecified) {
      return 1;
    }
    return this.firestoreOrderItem.numItems;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public isMatch(_orderItem: FirestoreOrderItem): ValidationResponse {
    return {
      isValid: true
    };
  }

  /**
   * getPossibleMatches queries for valid active orders that might be a match
   *
   * - due to firestore limitations and auctions, we cannot query for
   *  matches perfectly so the returned orders must be checked to see
   *  if they are a match
   */
  public getPossibleMatches(
    queryWithConstraints?: FirebaseFirestore.Query<FirestoreOrderItem>,
    pageSize = OrderItemConstraint.POSSIBLE_MATCHES_DEFAULT_PAGE_SIZE
  ): AsyncGenerator<FirestoreOrderItem> {
    if (!queryWithConstraints) {
      throw new Error('queryWithConstraints is required');
    }
    const orderByConstraint = new this.firestoreQueryOrderByConstraint(this);
    const { query, getStartAfter } = orderByConstraint.addOrderByToQuery(queryWithConstraints);

    return streamQuery<FirestoreOrderItem>(query, getStartAfter, {
      pageSize
    });
  }

  getNumConstraints(): number {
    return 0;
  }
}
