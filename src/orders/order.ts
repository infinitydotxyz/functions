import { OrderDirection } from '@infinityxyz/lib/types/core';
import {
  FirestoreOrder,
  FirestoreOrderItem,
  FirestoreOrderMatch,
  FirestoreOrderMatchStatus
} from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQuery } from '../firestore/stream-query';
import { getOrderIntersection } from '../utils/intersection';
import { OrderItem } from './order-item';
import { OrderItem as IOrderItem, OrderItemMatch } from './orders.types';

export class Order {
  static getRef(id: string): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return getDb()
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  public get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return this.db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(this.firestoreOrder.id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  private db: FirebaseFirestore.Firestore;

  constructor(public readonly firestoreOrder: FirestoreOrder) {
    this.db = getDb();
  }

  public async searchForMatches(): Promise<FirestoreOrderMatch[]> {
    const orderItems = await this.getOrderItems();
    const firstItem = orderItems[0];
    if (!firstItem) {
      throw new Error('invalid order, no order items found');
    }
    const possibleMatches = firstItem.getPossibleMatches();

    const matches: FirestoreOrderMatch[] = [];
    for await (const possibleMatch of possibleMatches) {
      /**
       * check if match is valid for the first item
       * if so, get the rest of the order and attempt to match it with the rest of the order
       */
      if (firstItem.isMatch(possibleMatch)) {
        const opposingOrder = await this.getOrder(possibleMatch.id);
        if (opposingOrder?.order && opposingOrder?.orderItems) {
          const result = this.checkForMatch(orderItems, opposingOrder);
          if (result.isMatch) {
            const firestoreOrderItemMatches = result.match.map((item) => {
              const one = item.order.firestoreOrderItem;
              const two = item.opposingOrder.firestoreOrderItem;
              const [listing, offer] = one.isSellOrder ? [one, two] : [two, one];
              return {
                listing,
                offer
              };
            });
            const ids = [this.firestoreOrder.id, opposingOrder.order.firestoreOrder.id];
            const [listingId, offerId] = this.firestoreOrder.isSellOrder ? ids : ids.reverse();
            const match: FirestoreOrderMatch = {
              ids: [offerId, listingId],
              offerId,
              listingId,
              price: result.price,
              timestamp: result.timestamp,
              matches: firestoreOrderItemMatches,
              status:
                result.timestamp > Date.now() ? FirestoreOrderMatchStatus.Inactive : FirestoreOrderMatchStatus.Active
            };
            matches.push(match);
          }
        }
      }
    }
    return matches;
  }

  public checkForMatch(
    orderItems: IOrderItem[],
    opposingOrder: { order: Order; orderItems: IOrderItem[] }
  ): { isMatch: false } | { isMatch: true; match: OrderItemMatch[]; price: number; timestamp: number } {
    const minOrderItemsToFulfill = this.firestoreOrder.numItems;

    const search = (orderItems: IOrderItem[], opposingOrderItems: IOrderItem[]): { matches: OrderItemMatch[] }[] => {
      const orderItemsCopy = [...orderItems];
      const opposingOrderItemsCopy = [...opposingOrderItems];
      const orderItem = orderItemsCopy.shift();

      if (!orderItem) {
        return [];
      }

      const paths = opposingOrderItemsCopy.flatMap((opposingOrderItem, index) => {
        let subPaths: { matches: OrderItemMatch[] }[] = [];

        if (orderItem.isMatch(opposingOrderItem.firestoreOrderItem)) {
          const unclaimedOpposingOrders = [...opposingOrderItemsCopy].splice(index, 1);
          const sub = search([...orderItemsCopy], unclaimedOpposingOrders);
          const match: OrderItemMatch = { order: orderItem, opposingOrder: opposingOrderItem };
          const subPathsWithMatch = sub.map(({ matches }) => {
            return { matches: [match, ...matches] };
          });
          subPaths = [...subPaths, { matches: [match] }, ...subPathsWithMatch];
        }

        const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
        const sub = search([...orderItemsCopy], unclaimedOpposingOrders);
        const subPathsWithoutMatch = sub.map(({ matches }) => {
          return { matches: [...matches] };
        });
        subPaths = [...subPaths, ...subPathsWithoutMatch];

        return subPaths;
      });
      return paths;
    };

    const paths = search(orderItems, opposingOrder.orderItems);
    const pathsSortedByMostMatches = paths
      .sort((itemA, itemB) => itemA.matches.length - itemB.matches.length)
      .filter((path) => {
        return (
          path.matches.length >= minOrderItemsToFulfill &&
          this.validateMatchForOpposingOrder(path.matches, opposingOrder.order)
        );
      });

    const mostMatches = pathsSortedByMostMatches[0];
    if (!mostMatches || mostMatches.matches.length < minOrderItemsToFulfill) {
      return {
        isMatch: false
      };
    }

    const intersection = getOrderIntersection(this.firestoreOrder, opposingOrder.order.firestoreOrder);
    if (!intersection) {
      return {
        isMatch: false
      };
    }

    const validAfter = intersection.timestamp;
    const isFutureMatch = validAfter > Date.now();

    if (isFutureMatch) {
      return {
        isMatch: true,
        match: mostMatches.matches,
        price: intersection.price,
        timestamp: intersection.timestamp
      };
    }

    const now = Date.now();
    return {
      isMatch: true,
      match: mostMatches.matches,
      price: intersection.getPriceAtTime(now),
      timestamp: now
    };
  }

  public validateMatchForOpposingOrder(matches: OrderItemMatch[], opposingOrder: Order): boolean {
    const matchesValid = matches.every((match) => match.opposingOrder.isMatch(match.order.firestoreOrderItem));
    const numItemsValid = matches.length >= opposingOrder.firestoreOrder.numItems;
    return matchesValid && numItemsValid;
  }

  async getOrderItems(): Promise<IOrderItem[]> {
    const firestoreOrderItems = await this.getFirestoreOrderItems();

    const orderItems = firestoreOrderItems
      .map((firestoreOrderItem) => {
        return new OrderItem(firestoreOrderItem, this.db).applyConstraints();
      })
      .sort((itemA, itemB) => itemB.constraintScore - itemA.constraintScore);

    return orderItems;
  }

  getExistingMatches(validOnly: boolean): AsyncGenerator<FirestoreOrder> {
    const matchesWithTimestampBefore = validOnly ? Date.now() : Number.MAX_SAFE_INTEGER;
    const orderMatches = this.db.collection(firestoreConstants.ORDER_MATCHES_COLL);
    const matchesQuery = orderMatches.where('ids', 'array-contains', this.firestoreOrder.id);

    const matches = matchesQuery
      .where('timestamp', '<=', matchesWithTimestampBefore)
      .orderBy('timestamp', OrderDirection.Ascending) as FirebaseFirestore.Query<FirestoreOrderMatch>;

    const transformPage = async (page: FirestoreOrderMatch[]): Promise<FirestoreOrder[]> => {
      const firestoreOrderRefs = page.map((match) => {
        const matchId = this.firestoreOrder.isSellOrder ? match.offerId : match.listingId;
        return this.db.collection(firestoreConstants.ORDERS_COLL).doc(matchId);
      });
      if (firestoreOrderRefs.length > 0) {
        const firestoreOrders = await this.db.getAll(...firestoreOrderRefs);
        return firestoreOrders.map((item) => item.data() as FirestoreOrder);
      }
      return [];
    };

    const getStartAfterField = (item: FirestoreOrderMatch) => [item.timestamp];
    return streamQuery<FirestoreOrderMatch, FirestoreOrder>(matches, getStartAfterField, {
      pageSize: 10,
      transformPage
    });
  }

  async saveMatches(matches: FirestoreOrderMatch[]): Promise<void> {
    const getMatchRef = (match: FirestoreOrderMatch) => {
      return this.db.collection(firestoreConstants.ORDER_MATCHES_COLL).doc(`${match.listingId}:${match.offerId}`);
    };
    const batchHandler = new FirestoreBatchHandler();

    const matchIds = new Set<string>();
    for (const match of matches) {
      const doc = getMatchRef(match);
      const id = doc.path;
      if (!matchIds.has(id)) {
        batchHandler.add(doc, match, { merge: false });
        matchIds.add(id);
      }
    }

    await batchHandler.flush();
  }

  private async getOrder(orderId: string): Promise<{ order: Order; orderItems: IOrderItem[] } | null> {
    const orderSnap = await Order.getRef(orderId).get();
    const orderData = orderSnap.data();
    if (!orderData) {
      return null;
    }
    const order = new Order(orderData);
    const orderItems = await order.getOrderItems();
    return {
      order,
      orderItems
    };
  }

  private async getFirestoreOrderItems(): Promise<FirestoreOrderItem[]> {
    const docs = await this.getFirestoreOrderItemDocs();
    const orderItems = docs.map((doc) => doc.data());
    return orderItems;
  }

  private async getFirestoreOrderItemDocs(): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[]> {
    const orderItems = await this.ref.collection(firestoreConstants.ORDER_ITEMS_SUB_COLL).get();
    return orderItems.docs as FirebaseFirestore.QueryDocumentSnapshot<FirestoreOrderItem>[];
  }
}
