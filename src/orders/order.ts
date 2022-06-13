import {
  ChainId,
  FirestoreOrderMatch,
  FirestoreOrderMatches,
  FirestoreOrderMatchMethod,
  FirestoreOrderMatchOneToMany,
  FirestoreOrderMatchOneToOne,
  FirestoreOrderMatchStatus,
  FirestoreOrderMatchToken,
  OrderDirection,
  UserOrderRole
} from '@infinityxyz/lib/types/core';
import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQuery } from '../firestore/stream-query';
import { getOrderIntersection } from '../utils/intersection';
import { OrderItem } from './order-item';
import { OneToManyOrderItemMatch, OrderItem as IOrderItem, OrderItemMatch } from './orders.types';
import { createHash } from 'crypto';

export class Order {
  static getRef(id: string): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return getDb()
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  private db: FirebaseFirestore.Firestore;

  constructor(public readonly firestoreOrder: FirestoreOrder) {
    this.db = getDb();
  }

  public get ref(): FirebaseFirestore.DocumentReference<FirestoreOrder> {
    return this.db
      .collection(firestoreConstants.ORDERS_COLL)
      .doc(this.firestoreOrder.id) as FirebaseFirestore.DocumentReference<FirestoreOrder>;
  }

  public async searchForMatches<T extends FirestoreOrderMatches>(): Promise<T[]> {
    const orderItems = await this.getOrderItems();
    const firstItem = orderItems[0];
    if (!firstItem) {
      throw new Error('invalid order, no order items found');
    }
    const possibleMatches = firstItem.getPossibleMatches();

    const matches: T[] = [];
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
            const match = this.getFirestoreOrderMatch(result.match, result.price, result.timestamp) as T;
            matches.push(match);
          }
        }
      }
    }
    return matches;
  }

  private getFirestoreOrderMatch(
    match: OrderItemMatch[],
    price: number,
    timestamp: number
  ): FirestoreOrderMatch | FirestoreOrderMatchOneToOne;
  private getFirestoreOrderMatch(
    match: OneToManyOrderItemMatch,
    price: number,
    timestamp: number
  ): FirestoreOrderMatchOneToMany;
  private getFirestoreOrderMatch(
    match: OrderItemMatch[] | OneToManyOrderItemMatch,
    price: number,
    timestamp: number
  ): FirestoreOrderMatches {
    if (Array.isArray(match)) {
      const ids = [
        ...new Set(
          match.flatMap(({ order, opposingOrder }) => [
            order.firestoreOrderItem.id,
            opposingOrder.firestoreOrderItem.id
          ])
        )
      ];

      const rawId = match
        .map(({ order, opposingOrder }) => {
          return `${order.firestoreOrderItem.id}:${opposingOrder.firestoreOrderItem.id}`;
        })
        .sort()
        .join('-')
        .trim()
        .toLowerCase();
      const id = createHash('sha256').update(rawId).digest('hex');
      const createdAt = Date.now();

      const collectionAddresses: string[] = [];
      const tokenStrings: string[] = [];

      const firstOrder = match[0].order;
      const firstOpposingOrder = match[0].opposingOrder;
      const [sampleListing, sampleOffer] = firstOrder.firestoreOrderItem.isSellOrder
        ? [firstOrder.firestoreOrderItem, firstOpposingOrder.firestoreOrderItem]
        : [firstOpposingOrder.firestoreOrderItem, firstOrder.firestoreOrderItem];

      const isOneToOne = match.length === 1; // TODO does this still work for one to many?
      // TODO handle one to many

      const firestoreOrderMatch: FirestoreOrderMatch | FirestoreOrderMatchOneToOne = { 
        id,
        ids,
        collectionAddresses: [],
        tokens: [],
        chainId: sampleListing.chainId as ChainId,
        createdAt,
        currencyAddress: sampleListing.currencyAddress,
        complicationAddress: sampleListing.complicationAddress,
        type: isOneToOne ? FirestoreOrderMatchMethod.MatchOneToOneOrders : FirestoreOrderMatchMethod.MatchOrders,
        matchData: {
          listingId: sampleListing.id,
          offerId: sampleOffer.id,
          orderItems: {}
        },
        usersInvolved: this.getUsersInvolved(match),
        state: {
          status: createdAt >= timestamp ? FirestoreOrderMatchStatus.Active : FirestoreOrderMatchStatus.Inactive,
          priceValid: price,
          timestampValid: timestamp
        }
      };

      for (const { order, opposingOrder } of match) {
        const collectionAddress =
          order.firestoreOrderItem.collectionAddress || opposingOrder.firestoreOrderItem.collectionAddress;
        const tokenId = order.firestoreOrderItem.tokenId || opposingOrder.firestoreOrderItem.tokenId;
        const collectionName =
          order.firestoreOrderItem.collectionName || opposingOrder.firestoreOrderItem.collectionName;
        const collectionImage =
          order.firestoreOrderItem.collectionImage || opposingOrder.firestoreOrderItem.collectionImage;
        const collectionSlug =
          order.firestoreOrderItem.collectionSlug || opposingOrder.firestoreOrderItem.collectionSlug;
        const hasBlueCheck = order.firestoreOrderItem.hasBlueCheck ?? opposingOrder.firestoreOrderItem.hasBlueCheck;
        const tokenName = order.firestoreOrderItem.tokenName || opposingOrder.firestoreOrderItem.tokenName;
        const tokenImage = order.firestoreOrderItem.tokenImage || opposingOrder.firestoreOrderItem.tokenImage;
        const tokenSlug = order.firestoreOrderItem.tokenSlug || opposingOrder.firestoreOrderItem.tokenSlug;
        const numTokens = order.firestoreOrderItem.numTokens ?? opposingOrder.firestoreOrderItem.numTokens;

        const token: FirestoreOrderMatchToken = {
          tokenId,
          tokenName,
          tokenImage,
          tokenSlug,
          numTokens
        };

        collectionAddresses.push(collectionAddress);
        if (tokenId) {
          tokenStrings.push(`${collectionAddress}:${tokenId}`);
        }

        if (!firestoreOrderMatch.matchData.orderItems[collectionAddress]) {
          firestoreOrderMatch.matchData.orderItems[collectionAddress] = {
            collectionAddress,
            collectionName,
            collectionImage,
            collectionSlug,
            hasBlueCheck,
            tokens: {}
          };
        }

        if (tokenId && !firestoreOrderMatch.matchData?.orderItems?.[collectionAddress]?.tokens?.[tokenId]) {
          firestoreOrderMatch.matchData.orderItems[collectionAddress].tokens[tokenId] = token;
        }
      }

      firestoreOrderMatch.tokens = [...new Set(tokenStrings)];
      firestoreOrderMatch.collectionAddresses = [...new Set(collectionAddresses)];

      return firestoreOrderMatch;
    }
    // TODO: handle one to many, including searching for one to many matches
    throw new Error('One to many matching not implemented yet');
  }

  public getUsersInvolved(match: OneToManyOrderItemMatch | OrderItemMatch[]): string[] {
    const usersAndRoles: Set<string> = new Set();
    const addUser = (firestoreOrderItem: FirestoreOrderItem) => {
      const orderSideRole = firestoreOrderItem.isSellOrder ? UserOrderRole.Lister : UserOrderRole.Offerer;
      usersAndRoles.add(firestoreOrderItem.makerAddress);
      usersAndRoles.add(`${firestoreOrderItem.makerAddress}:${orderSideRole}`);
    };

    if (Array.isArray(match)) {
      for (const { order, opposingOrder } of match) {
        addUser(order.firestoreOrderItem);
        addUser(opposingOrder.firestoreOrderItem);
      }
    } else {
      const { order, opposingOrders } = match;
      for (const o of [order, ...opposingOrders]) {
        addUser(o.firestoreOrderItem);
      }
    }

    return [...usersAndRoles];
  }

  public checkForMatch(
    orderItems: IOrderItem[],
    opposingOrder: { order: Order; orderItems: IOrderItem[] }
  ): { isMatch: false } | { isMatch: true; match: OrderItemMatch[]; price: number; timestamp: number } {
    const minOrderItemsToFulfill = this.firestoreOrder.numItems;

    const generateMatchCombinations = (
      orderItems: IOrderItem[],
      opposingOrderItems: IOrderItem[]
    ): { matches: OrderItemMatch[] }[] => {
      const orderItemsCopy = [...orderItems];
      const opposingOrderItemsCopy = [...opposingOrderItems];
      const orderItem = orderItemsCopy.shift();

      if (!orderItem) {
        return [];
      }

      const paths = opposingOrderItemsCopy.flatMap((opposingOrderItem, index) => {
        let subPaths: { matches: OrderItemMatch[] }[] = [];

        if (orderItem.isMatch(opposingOrderItem.firestoreOrderItem)) {
          const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
          unclaimedOpposingOrders.splice(index, 1);
          const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
          const match: OrderItemMatch = { order: orderItem, opposingOrder: opposingOrderItem };
          const subPathsWithMatch = sub.map(({ matches }) => {
            return { matches: [match, ...matches] };
          });
          subPaths = [...subPaths, { matches: [match] }, ...subPathsWithMatch];
        }

        const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
        const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
        const subPathsWithoutMatch = sub.map(({ matches }) => {
          return { matches: [...matches] };
        });
        subPaths = [...subPaths, ...subPathsWithoutMatch];

        return subPaths;
      });
      return paths;
    };

    const combinations = generateMatchCombinations(orderItems, opposingOrder.orderItems);
    const validCombinations = combinations.filter((path) => {
      return (
        path.matches.length >= minOrderItemsToFulfill &&
        this.validateMatchForOpposingOrder(path.matches, opposingOrder.order)
      );
    });

    const validCombinationsSortedByNumMatches = validCombinations.sort(
      (itemA, itemB) => itemA.matches.length - itemB.matches.length
    );

    const bestMatch = validCombinationsSortedByNumMatches[0];
    if (!bestMatch || bestMatch.matches.length < minOrderItemsToFulfill) {
      return {
        isMatch: false
      };
    }

    const priceIntersection = getOrderIntersection(this.firestoreOrder, opposingOrder.order.firestoreOrder);
    if (!priceIntersection) {
      return {
        isMatch: false
      };
    }

    const validAfter = priceIntersection.timestamp;
    const isFutureMatch = validAfter > Date.now();

    if (isFutureMatch) {
      return {
        isMatch: true,
        match: bestMatch.matches,
        price: priceIntersection.price,
        timestamp: priceIntersection.timestamp
      };
    }

    const now = Date.now();
    return {
      isMatch: true,
      match: bestMatch.matches,
      price: priceIntersection.getPriceAtTime(now),
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
        return new OrderItem(firestoreOrderItem, this.db, this.firestoreOrder, firestoreOrderItems).applyConstraints();
      })
      .sort((itemA, itemB) => itemB.constraintScore - itemA.constraintScore);

    return orderItems;
  }

  getExistingMatches(validOnly: boolean): AsyncGenerator<FirestoreOrder> {
    const matchesWithTimestampBefore = validOnly ? Date.now() : Number.MAX_SAFE_INTEGER;
    const orderMatches = this.db.collection(firestoreConstants.ORDER_MATCHES_COLL);
    const matchesQuery = orderMatches.where('ids', 'array-contains', this.firestoreOrder.id);

    const matches = matchesQuery
      .where('state.timestampValid', '<=', matchesWithTimestampBefore)
      .orderBy('state.timestampValid', OrderDirection.Ascending) as FirebaseFirestore.Query<FirestoreOrderMatch>;

    const transformPage = async (page: FirestoreOrderMatch[]): Promise<FirestoreOrder[]> => {
      const firestoreOrderRefs = page
        .map((match) => {
          const matchId = match.ids.filter((id) => id !== this.firestoreOrder.id)?.[0];
          if (!matchId) {
            return undefined;
          }
          return this.db.collection(firestoreConstants.ORDERS_COLL).doc(matchId);
        })
        .filter((item) => !!item) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[];

      if (firestoreOrderRefs.length > 0) {
        const firestoreOrders = await this.db.getAll(...firestoreOrderRefs);
        return firestoreOrders.map((item) => item.data() as FirestoreOrder);
      }
      return [];
    };

    const getStartAfterField = (item: FirestoreOrderMatch) => [item.state.timestampValid];
    return streamQuery<FirestoreOrderMatch, FirestoreOrder>(matches, getStartAfterField, {
      pageSize: 10,
      transformPage
    });
  }

  async saveMatches(matches: FirestoreOrderMatches[]): Promise<void> {
    const getMatchRef = (match: FirestoreOrderMatches) => {
      return this.db.collection(firestoreConstants.ORDER_MATCHES_COLL).doc(`${match.id}`);
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
