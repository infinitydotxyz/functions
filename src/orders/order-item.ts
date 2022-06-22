import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { OrderItemStartTimeConstraint } from './constraints/start-time-constraint';
import { OrderItem as IOrderItem } from './orders.types';
import { Constraint, constraints } from './constraints/constraint.types';
import { streamQuery } from '../firestore/stream-query';
import { nanoid } from 'nanoid';
import { getOneToManyOrderIntersection } from '../utils/intersection';

export class OrderItem implements IOrderItem {
  orderRef: FirebaseFirestore.DocumentReference<FirestoreOrder>;

  public firestoreQueryOrderByConstraint: Constraint = OrderItemStartTimeConstraint;

  public readonly id: string;

  public wrapper: IOrderItem;

  constructor(
    public readonly firestoreOrderItem: FirestoreOrderItem,
    public readonly db: FirebaseFirestore.Firestore
  ) // public readonly firestoreOrder: FirestoreOrder,
  // public readonly orderItems: FirestoreOrderItem[]
  {
    this.orderRef = this.db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(this.firestoreOrderItem.id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
    this.id = nanoid();
  }

  public get isAuction(): boolean {
    return this.firestoreOrderItem.startPriceEth !== this.firestoreOrderItem.endPriceEth;
  }

  public get constraintScore(): number {
    return 0;
  }

  public get maxNumItemsContribution(): number {
    const isFullySpecified = !!this.firestoreOrderItem.tokenId;
    if(isFullySpecified) {
      return 1;
    }
    return this.firestoreOrderItem.numItems;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public isMatch(_orderItem: FirestoreOrderItem): boolean {
    return true;
  }

  public areMatches(
    orderItems: IOrderItem[]
  ): { isValid: false } | { isValid: true; numItems: number; tokenIds: Set<string>; price: number; timestamp: number } {
    const allMatch = orderItems.every(
      (orderItem) => this.wrapper.isMatch(orderItem.firestoreOrderItem) && orderItem.isMatch(this.firestoreOrderItem)
    );
    const tokenIdsValid = this.checkTokenIds(orderItems);
    if (!tokenIdsValid.isValid) {
      return { isValid: false };
    }

    const numItemsValid = this.checkNumItems(tokenIdsValid.tokenIds);
    if (!numItemsValid.isValid) {
      return { isValid: false };
    }

    const uniqueOrders = this.getUniqueOrders(orderItems);
    const sampleOrderItems = [...uniqueOrders.values()].map((item) => item[0].firestoreOrderItem);
    const priceIntersection = getOneToManyOrderIntersection(this.firestoreOrderItem, sampleOrderItems);

    if (!allMatch || !priceIntersection) {
      return {
        isValid: false
      };
    }

    return {
      isValid: true,
      numItems: numItemsValid.numItems,
      tokenIds: tokenIdsValid.tokenIds,
      price: priceIntersection.price,
      timestamp: priceIntersection.timestamp
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
    queryWithConstraints?: FirebaseFirestore.Query<FirestoreOrderItem>
  ): AsyncGenerator<FirestoreOrderItem> {
    if (!queryWithConstraints) {
      throw new Error('queryWithConstraints is required');
    }
    const orderByConstraint = new this.firestoreQueryOrderByConstraint(this);
    const { query, getStartAfter } = orderByConstraint.addOrderByToQuery(queryWithConstraints);

    return streamQuery<FirestoreOrderItem>(query, getStartAfter, {
      pageSize: 10
    });
  }

  getNumConstraints(): number {
    return 0;
  }

  private checkNumItems(tokenIds: Set<string>): { isValid: boolean; numItems: number } {
    if (this.firestoreOrderItem.isSellOrder) {
      /**
       * num items is a maximum
       */
      const isValid = tokenIds.size <= this.firestoreOrderItem.numItems;
      return { isValid, numItems: tokenIds.size };
    }
    /**
     * num items is a minimum for the full order
     */
    return { isValid: true, numItems: tokenIds.size };
  }

  private checkTokenIds(orderItems: IOrderItem[]): { isValid: false } | { isValid: true; tokenIds: Set<string> } {
    const tokenIds = new Set<string>();
    /**
     * if this order item specifies a token id then
     * the order item can be matched with one other order item
     * and the token id must match
     */
    const expectSingleOrderItem = !!this.firestoreOrderItem.tokenId;

    if (expectSingleOrderItem && orderItems.length > 1) {
      return {
        isValid: false
      };
    } else if (expectSingleOrderItem) {
      const tokenId = this.firestoreOrderItem.tokenId;
      tokenIds.add(tokenId);
      return {
        isValid: true,
        tokenIds
      };
    }

    /**
     * if this order item does not specify a token id then
     * the order item can be matches with multiple other order
     * items as long as they specify different token ids
     */

    for (const orderItem of orderItems) {
      const tokenId = orderItem.firestoreOrderItem.tokenId;
      if (!tokenId || tokenIds.has(tokenId)) {
        return {
          isValid: false
        };
      }
    }

    return { isValid: true, tokenIds };
  }

  private getUniqueOrders(orderItems: IOrderItem[]): Map<string, IOrderItem[]> {
    const uniqueOrders = new Map<string, IOrderItem[]>();
    for (const orderItem of orderItems) {
      const orderId = orderItem.firestoreOrderItem.id;
      const orderItemsByOrderId = uniqueOrders.get(orderId) ?? [];
      orderItemsByOrderId.push(orderItem);
      uniqueOrders.set(orderId, orderItemsByOrderId);
    }

    return uniqueOrders;
  }
}
