import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { streamQuery } from '../firestore';
import { OrderItem as IOrderItem } from './orders.types';

export class OrderItem implements IOrderItem {
  constructor(public readonly firestoreOrderItem: FirestoreOrderItem, private db: FirebaseFirestore.Firestore) {}

  public get isAuction(): boolean {
    return this.firestoreOrderItem.startPriceEth !== this.firestoreOrderItem.endPriceEth;
  }

  public get constraintScore(): number {
    return 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public isMatch(_orderItem: FirestoreOrderItem): boolean {
    return true;
  }

  //   public isMatch(orderItem: FirestoreOrderItem): boolean {
  //     const chainIdMatches = this.firestoreOrderItem.chainId === orderItem.chainId;
  //     const addressMatches = this.firestoreOrderItem.collectionAddress === orderItem.collectionAddress;
  //     const tokenIdMatches = this.firestoreOrderItem.tokenId
  //       ? this.firestoreOrderItem.tokenId === orderItem.tokenId
  //       : true;
  //     const orderSideValid = this.firestoreOrderItem.isSellOrder !== orderItem.isSellOrder;

  //     const offer = this.firestoreOrderItem.isSellOrder ? orderItem : this.firestoreOrderItem;
  //     const listing = this.firestoreOrderItem.isSellOrder ? this.firestoreOrderItem : orderItem;

  //     const maxTokensToSell = listing.numTokens;
  //     const minTokensToBuy = offer.numTokens;
  //     const numTokensValid = maxTokensToSell >= minTokensToBuy;

  //     const intersection = this.getIntersection(orderItem);
  //     if (intersection === null) {
  //       return false;
  //     }

  //     return chainIdMatches && addressMatches && tokenIdMatches && orderSideValid && numTokensValid;
  //   }

  /**
   * getPossibleMatches queries for valid active orders that might be a match
   *
   * - due to firestore limitations and auctions, we cannot query for
   *  matches perfectly so the returned orders must be checked to see
   *  if they are a match
   */
  public getPossibleMatches(
    queryWithConstraints: FirebaseFirestore.Query<FirestoreOrderItem>
  ): AsyncGenerator<FirestoreOrderItem> {
    // let orders = this.db
    //   .collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL)
    //   .where('chainId', '==', this.firestoreOrderItem.chainId)
    //   .where('collectionAddress', '==', this.firestoreOrderItem.collectionAddress)
    //   .where('isSellOrder', '==', !this.firestoreOrderItem.isSellOrder)
    //   .where('orderStatus', '==', OBOrderStatus.ValidActive);

    // if (this.firestoreOrderItem.tokenId) {
    //   orders = orders.where('tokenId', '==', this.firestoreOrderItem.tokenId);
    // }

    // /**
    //  * numTokens is min for buy and max for sell
    //  */
    // if (this.firestoreOrderItem.isSellOrder) {
    //   /**
    //    * this order is a listing
    //    * numTokens is the max number to sell
    //    */
    //   orders = orders.where('numTokens', '<=', this.firestoreOrderItem.numTokens);
    // } else {
    //   /**
    //    * this order is an offer
    //    * numTokens is the min number to buy
    //    */
    //   orders = orders.where('numTokens', '>=', this.firestoreOrderItem.numTokens);
    // }
    let orders = queryWithConstraints;

    /**
     * get the orders
     */
    orders = orders.where('startTimeMs', '<=', this.firestoreOrderItem.endTimeMs);
    orders = orders.orderBy('startTimeMs', 'asc');

    const getStartAfterField = (order: FirestoreOrderItem) => {
      return order.startTimeMs;
    };

    return streamQuery<FirestoreOrderItem>(orders, getStartAfterField, {
      pageSize: 10
    });
  }

  getNumConstraints(): number {
    return 0;
  }
}
