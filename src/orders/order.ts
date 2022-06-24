import {
  ChainId,
  FirestoreOrderMatch,
  FirestoreOrderMatchCollection,
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

  public static isFullySpecified(orderItems: IOrderItem[]) {
    return orderItems.reduce((fullySpecified, orderItem) => {
      return fullySpecified && !!orderItem.firestoreOrderItem.tokenId;
    }, orderItems.length > 0)
  }

  public async searchForMatches(): Promise<{ matches: FirestoreOrderMatches[] }> {
    /**
     * get the order items for this order
     */
    const orderItems = await this.getOrderItems();
    const firstItem = orderItems[0]; // we don't have to match every item with another item
    if (!firstItem) {
      throw new Error('invalid order, no order items found');
    }

    const orderSubsetMatches = new Map<string, { matches: OrderItemMatch[] }[]>();
    const fullMatches: {
      order: Order;
      orderItems: IOrderItem[];
      matches: OrderItemMatch[];
      price: number;
      timestamp: number;
    }[] = [];

    /**
     * get the possible matches for every order item in the order
     */
    for (const orderItem of orderItems) {
      const possibleMatches = orderItem.getPossibleMatches(); // TODO should erc1155 use the num tokens constraint?
      for await (const possibleMatch of possibleMatches) {
        if (orderItem.isMatch(possibleMatch)) {
          const possibleMatchOrderItemId = possibleMatch.id;
          if (!orderSubsetMatches.has(possibleMatchOrderItemId)) {
            const opposingOrder = await this.getOrder(possibleMatchOrderItemId); // TODO optimize with a getAll
            if (opposingOrder?.orderItems && opposingOrder?.order) {
              const matches = this.checkForMatches(
                opposingOrder?.orderItems,
                {
                  order: this,
                  orderItems
                },
                1
              ); // 1 to get all partial matches
              const opposingOrderPartialMatches = matches
                .map(({ match, price, timestamp }) => {
                  return {
                    ...opposingOrder,
                    matches: match,
                    price,
                    timestamp
                  };
                })
                .filter((item) => item.matches.length < this.firestoreOrder.numItems); // filter out full matches
              orderSubsetMatches.set(possibleMatchOrderItemId, opposingOrderPartialMatches);

              const bestFullMatch = this.getBestMatch(matches, this.firestoreOrder.numItems);
              if (bestFullMatch.isMatch) {
                fullMatches.push({
                  ...opposingOrder,
                  matches: bestFullMatch.match,
                  price: bestFullMatch.price,
                  timestamp: bestFullMatch.timestamp
                });
              }
            }
          }
        }
      }
    }

    const singleMatches = fullMatches.reduce((acc: (FirestoreOrderMatch | FirestoreOrderMatchOneToOne)[], item) => {
      const orderMatch = this.getFirestoreOrderMatch(item.matches, item.price, item.timestamp);
      return [...acc, orderMatch];
    }, []);
    return { matches: singleMatches };
  }

  private getFirestoreOrderMatch(
    match: OrderItemMatch[],
    price: number,
    timestamp: number
  ): FirestoreOrderMatch | FirestoreOrderMatchOneToOne {
    const ids = [
      ...new Set(
        match.flatMap(({ orderItem, opposingOrderItem }) => [
          orderItem.firestoreOrderItem.id,
          opposingOrderItem.firestoreOrderItem.id
        ])
      )
    ];

    const rawId = match
      .map(({ orderItem, opposingOrderItem }) => {
        const [listing, offer] = orderItem.firestoreOrderItem.isSellOrder
          ? [orderItem.firestoreOrderItem, opposingOrderItem.firestoreOrderItem]
          : [opposingOrderItem.firestoreOrderItem, orderItem.firestoreOrderItem];
        return `${listing.id}:${offer.id}`;
      })
      .sort()
      .join('-')
      .trim()
      .toLowerCase();
    const id = createHash('sha256').update(rawId).digest('hex');
    const createdAt = Date.now();

    const collectionAddresses: string[] = [];
    const tokenStrings: string[] = [];

    const firstOrder = match[0].orderItem;
    const firstOpposingOrder = match[0].opposingOrderItem;
    const [sampleListing, sampleOffer] = firstOrder.firestoreOrderItem.isSellOrder
      ? [firstOrder.firestoreOrderItem, firstOpposingOrder.firestoreOrderItem]
      : [firstOpposingOrder.firestoreOrderItem, firstOrder.firestoreOrderItem];

    const isOneToOne = match.length === 1; // TODO make sure the orders only contain a single nft

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

    for (const { orderItem, opposingOrderItem } of match) {
      const collectionAddress =
        orderItem.firestoreOrderItem.collectionAddress || opposingOrderItem.firestoreOrderItem.collectionAddress;
      const tokenId = orderItem.firestoreOrderItem.tokenId || opposingOrderItem.firestoreOrderItem.tokenId;
      const collectionName =
        orderItem.firestoreOrderItem.collectionName || opposingOrderItem.firestoreOrderItem.collectionName;
      const collectionImage =
        orderItem.firestoreOrderItem.collectionImage || opposingOrderItem.firestoreOrderItem.collectionImage;
      const collectionSlug =
        orderItem.firestoreOrderItem.collectionSlug || opposingOrderItem.firestoreOrderItem.collectionSlug;
      const hasBlueCheck =
        orderItem.firestoreOrderItem.hasBlueCheck ?? opposingOrderItem.firestoreOrderItem.hasBlueCheck;
      const tokenName = orderItem.firestoreOrderItem.tokenName || opposingOrderItem.firestoreOrderItem.tokenName;
      const tokenImage = orderItem.firestoreOrderItem.tokenImage || opposingOrderItem.firestoreOrderItem.tokenImage;
      const tokenSlug = orderItem.firestoreOrderItem.tokenSlug || opposingOrderItem.firestoreOrderItem.tokenSlug;
      const numTokens = orderItem.firestoreOrderItem.numTokens ?? opposingOrderItem.firestoreOrderItem.numTokens;

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
          tokens: {},
          chainId: orderItem.firestoreOrderItem.chainId as ChainId
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

  public getFirestoreOrderMatchOneToMany(
    matches: {orderItem: FirestoreOrderItem, opposingOrderItem: FirestoreOrderItem}[],
    price: number,
    timestamp: number
  ): FirestoreOrderMatchOneToMany {
    const mainOrderId = matches[0].orderItem.id;
    const opposingOrderIds = matches.map(({ opposingOrderItem }) => opposingOrderItem.id);
    const ids = [...new Set([mainOrderId, ...opposingOrderIds])];

    const orderIds = [[mainOrderId], opposingOrderIds];
    const [listingIds, offerIds] = this.firestoreOrder.isSellOrder ? orderIds : orderIds.reverse();

    type OrderItems = {
      [collectionAddress: string]: FirestoreOrderMatchCollection;
    };

    const orderItems: OrderItems = matches.reduce((acc: OrderItems, item) => {
      const collectionAddress = item.opposingOrderItem.collectionAddress;
      const tokenId = item.opposingOrderItem.tokenId;
      const collectionName = item.opposingOrderItem.collectionName;
      const collectionImage = item.opposingOrderItem.collectionImage;
      const collectionSlug = item.opposingOrderItem.collectionSlug;
      const hasBlueCheck = item.opposingOrderItem.hasBlueCheck;

      const tokens = acc[collectionAddress]?.tokens ?? {};
      const orderItems: OrderItems = {
        ...acc,
        [collectionAddress]: {
          collectionAddress,
          collectionName,
          collectionImage,
          collectionSlug,
          hasBlueCheck,
          chainId: item.opposingOrderItem.chainId as ChainId,
          tokens: {
            ...tokens,
            [tokenId]: {
              tokenId,
              tokenName: item.opposingOrderItem.tokenName,
              tokenImage: item.opposingOrderItem.tokenImage,
              tokenSlug: item.opposingOrderItem.tokenSlug,
              numTokens: item.opposingOrderItem.numTokens
            }
          }
        }
      };
      return orderItems;
    }, {} );

    const collectionAddresses = Object.keys(orderItems);
    const tokenStrings = collectionAddresses.reduce((acc: string[], collectionAddress) => {
      const tokens = orderItems[collectionAddress].tokens;
      const tokenStrings = Object.values(tokens).map((item) => `${collectionAddress}:${item.tokenId}`);
      return [...new Set([...acc, ...tokenStrings])];
    }, []);

    const rawId = ids.sort().join('-').trim().toLowerCase();
    const id = createHash('sha256').update(rawId).digest('hex');

    const createdAt = Date.now();
    const firestoreOrderMatch: FirestoreOrderMatchOneToMany = {
      type: FirestoreOrderMatchMethod.MatchOneToManyOrders,
      usersInvolved: this.getUsersInvolved(matches),
      id,
      ids,
      collectionAddresses,
      chainId: this.firestoreOrder.chainId as ChainId,
      complicationAddress: this.firestoreOrder.complicationAddress,
      tokens: tokenStrings,
      currencyAddress: this.firestoreOrder.currencyAddress,
      createdAt,
      state: {
        status: createdAt >= timestamp ? FirestoreOrderMatchStatus.Active : FirestoreOrderMatchStatus.Inactive,
        priceValid: price,
        timestampValid: timestamp
      },
      matchData: {
        listingIds,
        offerIds,
        orderItems: orderItems
      }
    };
    return firestoreOrderMatch;
  }

  public getUsersInvolved(match: OneToManyOrderItemMatch[] | OrderItemMatch[] | { orderItem: FirestoreOrderItem, opposingOrderItem: FirestoreOrderItem }[]): string[] {
    const usersAndRoles: Set<string> = new Set();
    const addUser = (firestoreOrderItem: FirestoreOrderItem) => {
      const orderSideRole = firestoreOrderItem.isSellOrder ? UserOrderRole.Lister : UserOrderRole.Offerer;
      usersAndRoles.add(firestoreOrderItem.makerAddress);
      usersAndRoles.add(`${firestoreOrderItem.makerAddress}:${orderSideRole}`);
    };

    for (const item of match) {
      if ('opposingOrderItem' in item) {
        if(item.opposingOrderItem instanceof OrderItem) {
          addUser(item.opposingOrderItem.firestoreOrderItem);
        } else {
          addUser(item.opposingOrderItem as FirestoreOrderItem);
        }

        if(item.orderItem instanceof OrderItem) {
          addUser(item.orderItem.firestoreOrderItem);
        } else {
          addUser(item.orderItem as FirestoreOrderItem);
        }
      } else {
        addUser(item.orderItem.firestoreOrderItem);
        for (const opposingOrder of item.opposingOrderItems) {
          addUser(opposingOrder.firestoreOrderItem);
        }
      }
    }

    return [...usersAndRoles];
  }

  public getBestMatch(
    matches: { match: OrderItemMatch[]; price: number; timestamp: number }[],
    minOrderItemsToFulfill: number
  ): { isMatch: false } | { isMatch: true; match: OrderItemMatch[]; price: number; timestamp: number } {
    const validCombinationsSortedByNumMatches = matches.sort((itemA, itemB) => itemB.match.length - itemA.match.length);

    /**
     * prefer the combination that fulfills the maximum number of order items
     */
    const bestMatch = validCombinationsSortedByNumMatches[0];
    if (!bestMatch || bestMatch.match.length < minOrderItemsToFulfill) {
      return {
        isMatch: false
      };
    }

    return {
      isMatch: true,
      ...bestMatch
    };
  }

  public checkForMatches(
    orderItems: IOrderItem[],
    opposingOrder: { order: Order; orderItems: IOrderItem[] },
    minOrderItemsToFulfill: number
  ): { match: OrderItemMatch[]; price: number; timestamp: number }[] {
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
          const match: OrderItemMatch = { orderItem: orderItem, opposingOrderItem: opposingOrderItem };
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

    const priceIntersection = getOrderIntersection(this.firestoreOrder, opposingOrder.order.firestoreOrder);
    if (priceIntersection === null) {
      return [];
    }

    const combinations = generateMatchCombinations(orderItems, opposingOrder.orderItems);
    const validCombinations = combinations.filter((path) => {
      return (
        path.matches.length >= minOrderItemsToFulfill &&
        this.validateMatchForOpposingOrder(path.matches, opposingOrder.order)
      );
    });

    const validAfter = priceIntersection.timestamp;
    const isFutureMatch = validAfter > Date.now();

    if (isFutureMatch) {
      return validCombinations.map((item) => {
        return {
          match: item.matches,
          price: priceIntersection.price,
          timestamp: priceIntersection.timestamp
        };
      });
    }

    const now = Date.now();
    const currentPrice = priceIntersection.getPriceAtTime(now);
    if (currentPrice === null) {
      return [];
    }

    return validCombinations.map((item) => {
      return {
        match: item.matches,
        price: currentPrice,
        timestamp: now
      };
    });
  }

  public validateMatchForOpposingOrder(matches: OrderItemMatch[], opposingOrder: Order): boolean {
    const matchesValid = matches.every((match) => match.opposingOrderItem.isMatch(match.orderItem.firestoreOrderItem));
    const isNumItemsValid = this.isNumItemsValid(opposingOrder.firestoreOrder.numItems, matches.length);
    return isNumItemsValid && matchesValid;
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

  private isNumItemsValid(opposingOrderNumItems: number, numMatches: number) {
    const isOpposingOrderBuyOrder = this.firestoreOrder.isSellOrder;
    if (isOpposingOrderBuyOrder) {
      const numItemsValid = numMatches >= opposingOrderNumItems && this.firestoreOrder.numItems <= numMatches;
      return numItemsValid;
    }
    const numItemsValid = numMatches <= opposingOrderNumItems && this.firestoreOrder.numItems >= numMatches;
    return numItemsValid;
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
