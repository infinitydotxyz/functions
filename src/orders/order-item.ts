import { FirestoreOrderItem } from "@infinityxyz/lib/types/core/OBOrder";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import { streamQuery } from "../firestore";
import { getOrderIntersection } from "../utils/intersection";
import { OrderPriceIntersection } from "../utils/intersection.types";
import { OrderItemPrice } from "./orders.types";

export class OrderItem {
  constructor(
    private firestoreOrderItem: FirestoreOrderItem,
    private db: FirebaseFirestore.Firestore
  ) {}

  public isMatch(orderItem: FirestoreOrderItem): boolean {
    const chainIdMatches =
      this.firestoreOrderItem.chainId === orderItem.chainId;
    const addressMatches =
      this.firestoreOrderItem.collectionAddress === orderItem.collectionAddress;
    const tokenIdMatches = this.firestoreOrderItem.tokenId
      ? this.firestoreOrderItem.tokenId === orderItem.tokenId
      : true;
    const orderSideValid =
      this.firestoreOrderItem.isSellOrder !== orderItem.isSellOrder;

    /**
     * we might be okay with taking more/less
     */
    const numTokensMatches =
      this.firestoreOrderItem.numTokens === orderItem.numTokens;

    const intersection = this.getIntersection(orderItem);
    if (intersection === null) {
      return false;
    }

    return (
      chainIdMatches &&
      addressMatches &&
      tokenIdMatches &&
      orderSideValid &&
      numTokensMatches
    );
  }

  public getMatches(): AsyncGenerator<FirestoreOrderItem> {
    const ordersInCollection = this.db
      .collectionGroup(firestoreConstants.ORDER_ITEMS_SUB_COLL)
      .where("chainId", "==", this.firestoreOrderItem.chainId)
      .where(
        "collectionAddress",
        "==",
        this.firestoreOrderItem.collectionAddress
      );

    const opposingOrdersInCollection = ordersInCollection.where(
      "isSellOrder",
      "==",
      !this.firestoreOrderItem.isSellOrder
    );

    let orders = this.firestoreOrderItem.tokenId
      ? opposingOrdersInCollection.where(
          "tokenId",
          "==",
          this.firestoreOrderItem.tokenId
        )
      : opposingOrdersInCollection;

    /**
     * numTokens is min for buy and max for sell
     */
    if (this.firestoreOrderItem.isSellOrder) {
      /**
       * this order is a listing
       * numTokens is the max number to sell
       */
      orders = orders.where(
        "numTokens",
        "<=",
        this.firestoreOrderItem.numTokens
      );
    } else {
      /**
       * this order is an offer
       * numTokens is the min number to buy
       */
      orders = orders.where(
        "numTokens",
        ">=",
        this.firestoreOrderItem.numTokens
      );
    }

    /**
     * get the orders
     */
    orders = orders.where(
      "startTimeMs",
      "<=",
      this.firestoreOrderItem.endTimeMs
    );
    orders = orders.orderBy("startTimeMs", "asc");

    const getStartAfterField = (order: FirestoreOrderItem) => {
      return order.startTimeMs;
    };

    return streamQuery<FirestoreOrderItem>(
      orders as FirebaseFirestore.Query<FirestoreOrderItem>,
      getStartAfterField,
      { pageSize: 10 }
    );
  }

  public getIntersection(order: OrderItemPrice): OrderPriceIntersection {
    const intersection = getOrderIntersection(this.firestoreOrderItem, order);
    return intersection;
  }
}
