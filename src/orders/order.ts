import {
  ChainId,
  FirestoreOrderMatch,
  FirestoreOrderMatches,
  FirestoreOrderMatchMethod,
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

  // public async searchForMatches<T extends FirestoreOrderMatches>(): Promise<T[]> {
  //   const orderItems = await this.getOrderItems();
  //   const firstItem = orderItems[0];
  //   if (!firstItem) {
  //     throw new Error('invalid order, no order items found');
  //   }
  //   const possibleMatches = firstItem.getPossibleMatches(); // TODO what if this order item isn't required for the order to be fulfilled?

  //   const matches: T[] = [];
  //   for await (const possibleMatch of possibleMatches) {
  //     /**
  //      * check if match is valid for the first item
  //      * if so, get the rest of the order and attempt to match it with the rest of the order
  //      */
  //     if (firstItem.isMatch(possibleMatch)) {
  //       const opposingOrder = await this.getOrder(possibleMatch.id);
  //       if (opposingOrder?.order && opposingOrder?.orderItems) {
  //         /**
  //          * TODO check if the opposing order can be fulfilled by this order and if so trigger scan for opposing order
  //          * required so that if this order is a many order
  //          */

  //         const result = this.checkForMatch(orderItems, opposingOrder, this.firestoreOrder.numItems);
  //         if (result.isMatch) {
  //           const match = this.getFirestoreOrderMatch(result.match, result.price, result.timestamp) as T;
  //           matches.push(match);
  //         }
  //       }
  //     }
  //   }
  //   return matches;
  // }

  public async searchForMatches(): Promise<{ matches: FirestoreOrderMatches[] }> {
    /**
     * get the order items for this order
     */
    const orderItems = await this.getOrderItems();
    const firstItem = orderItems[0]; // we don't have to match every item with another item
    if (!firstItem) {
      throw new Error('invalid order, no order items found');
    }

    const orderSubsetMatches = new Map<string, { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[] }>();
    /**
     * get the possible matches for every order item in the order
     */
    for (const orderItem of orderItems) {
      const possibleMatches = orderItem.getPossibleMatches(); // TODO should erc1155 use the num tokens constraint?
      for await (const possibleMatch of possibleMatches) {
        if (orderItem.isMatch(possibleMatch)) {
          const orderId = possibleMatch.id;
          if (!orderSubsetMatches.has(orderId)) {
            const opposingOrder = await this.getOrder(orderId); // TODO optimize with a getAll
            if (opposingOrder?.orderItems && opposingOrder?.order) {
              const minOrderItemsToFulfill = 1; // require the opposing order to fulfill at least one item in this order
              const opposingOrderMatch = this.checkForMatch(
                opposingOrder?.orderItems,
                {
                  order: this,
                  orderItems: orderItems
                },
                minOrderItemsToFulfill
              );
              if (opposingOrderMatch.isMatch) {
                orderSubsetMatches.set(opposingOrder.order.firestoreOrder.id, {
                  ...opposingOrder,
                  matches: opposingOrderMatch.match
                });
              }
            }
          }
        }
      }
    }
    // TODO handle many order matches
    const { singleOrderMatches, manyOrderMatches } = this.generateMatches(orderItems, [...orderSubsetMatches.values()]);
    const orderMatches = singleOrderMatches.reduce(
      (acc: (FirestoreOrderMatch | FirestoreOrderMatchOneToOne)[], item) => {
        const intersection = getOrderIntersection(this.firestoreOrder, item.order.firestoreOrder);
        if (intersection !== null) {
          const orderMatch = this.getFirestoreOrderMatch(item.matches, intersection.price, intersection.timestamp);
          return [...acc, orderMatch];
        }
        return acc;
      },
      []
    );
    return { matches: orderMatches };
  }

  /**
   * takes an array of orders with their corresponding order items and an array of matches
   * that they fulfill within this order. each order can be fully fulfilled by this order
   *
   * goal is to find the shortest paths that fulfill the order up to some max depth (i.e. number of orders)
   *
   * TODO how do we determine max depth? how will gas be affected?
   */
  private generateMatches(
    orderItems: IOrderItem[],
    orderSubsetMatches: { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[] }[]
  ) {
    const orderItemIds = [...new Set(orderItems.map((item) => item.id))];

    const getComplementaryOrderItemIds = (orderIds: string[]) => {
      const orderIdSet = new Set(orderIds);
      const complementaryOrderItemIds = orderItemIds.filter((id) => !orderIdSet.has(id));
      return complementaryOrderItemIds;
    };
    type OrderMatch = {
      order: Order;
      orderItems: IOrderItem[];
      matches: OrderItemMatch[];
    };

    /**
     * full order matches are can fulfill the full order on their own
     * partial order matches require to be combined with other order to fulfill the order
     */
    const { fullOrderMatches, partialOrderMatches } = orderSubsetMatches.reduce(
      (acc: { fullOrderMatches: OrderMatch[]; partialOrderMatches: OrderMatch[] }, orderSubsetMatch) => {
        const isFullOrderMatch = this.isNumItemsValid(
          orderSubsetMatch.order.firestoreOrder.numItems,
          orderSubsetMatch.matches.length
        );
        return {
          fullOrderMatches: isFullOrderMatch ? [...acc.fullOrderMatches, orderSubsetMatch] : acc.fullOrderMatches,
          partialOrderMatches: !isFullOrderMatch
            ? [...acc.partialOrderMatches, orderSubsetMatch]
            : acc.partialOrderMatches
        };
      },
      { fullOrderMatches: [], partialOrderMatches: [] }
    );

    const orderItemsById = new Map<string, IOrderItem>(orderItems.map((item) => [item.id, item]));

    const ordersByMatch = new Map<
      OrderItemMatch,
      { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[] }
    >();
    for (const orderSubsetMatch of partialOrderMatches) {
      for (const match of orderSubsetMatch.matches) {
        ordersByMatch.set(match, orderSubsetMatch);
      }
    }

    /**
     * create unique ids for each order item in this order
     * store matches in a map with the id as the key
     */
    const matchesByOrderItemFulfilled = new Map<string, OrderItemMatch[]>();
    for (const orderSubsetMatch of partialOrderMatches) {
      for (const match of orderSubsetMatch.matches) {
        const id = match.order.id;
        const existingMatches = matchesByOrderItemFulfilled.get(id) ?? [];
        existingMatches.push(match);
        matchesByOrderItemFulfilled.set(id, existingMatches);
      }
    }

    for (const subsetMatch of partialOrderMatches) {
      const opposingOrder = subsetMatch.order;
      const opposingOrderItems = subsetMatch.orderItems;
      const matches = subsetMatch.matches;
      const orderIdsInMatches = matches.map((item) => item.order.id);
      const complementaryOrderItemIds = getComplementaryOrderItemIds(orderIdsInMatches);
      const unmatchedOrderItems = complementaryOrderItemIds.map((id) => {
        const matchesForOrderItem = matchesByOrderItemFulfilled.get(id) ?? [];
        const orderItem = orderItemsById.get(id);
        return {
          orderItem,
          matches: matchesForOrderItem
        };
      });

      // const nonConflictingUnmatchedOrderItems = unmatchedOrderItems.filter(()

      /**
       * how do we generate combinations of order items such that
       * the combinations are not conflicting (i.e. no order items are matched by multiple orders)
       * the number of order items is constraint is fulfilled
       * the price/time is fulfilled
       */
    }

    return {
      singleOrderMatches: fullOrderMatches,
      manyOrderMatches: [] // TODO
    };
  }

  //   /**
  //    * order item match := an order that fulfills a subset of the order items for the order
  //    *
  //    * use the order item matches we just found to attempt to create order matches for this order
  //    * - we attempt to do this by generating combinations of order item matches and seeing if they
  //    *  can be used to fulfill the order
  //    */
  //   const combineOrderItemMatchesToSatisfyOrder = (
  //     orderItemMatches: {
  //       order: Order;
  //       orderItems: IOrderItem[];
  //     }[]
  //   ): { matches: OneToManyOrderItemMatch[] }[] => {
  //     const orderItemMatchesCopy = [...orderItemMatches];
  //     const orderItem = orderItemMatchesCopy.shift();
  //     if (!orderItem) {
  //       return [];
  //     }

  //     const;

  //     const paths = opposingOrderItemsCopy.flatMap((opposingOrderItem, index) => {
  //       let subPaths: { matches: OrderItemMatch[] }[] = [];

  //       if (orderItem.isMatch(opposingOrderItem.firestoreOrderItem)) {
  //         const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
  //         unclaimedOpposingOrders.splice(index, 1);
  //         const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
  //         const match: OrderItemMatch = { order: orderItem, opposingOrder: opposingOrderItem };
  //         const subPathsWithMatch = sub.map(({ matches }) => {
  //           return { matches: [match, ...matches] };
  //         });
  //         subPaths = [...subPaths, { matches: [match] }, ...subPathsWithMatch];
  //       }

  //       const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
  //       const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
  //       const subPathsWithoutMatch = sub.map(({ matches }) => {
  //         return { matches: [...matches] };
  //       });
  //       subPaths = [...subPaths, ...subPathsWithoutMatch];

  //       return subPaths;
  //     });
  //     return paths;
  //   };
  // }

  // public async searchForOneToManyMatches(
  //   orderItemsToFulfill: OrderItem[],
  //   ordersTaken: Set<string>,
  //   depth: number
  // ): Promise<OneToManyOrderItemMatch[]> {
  //   const firstItem = orderItemsToFulfill[0];
  //   if (!firstItem) {
  //     throw new Error('invalid order, no order items found');
  //   }
  //   const possibleMatches = firstItem.getPossibleMatches();

  //   const matches: OneToManyOrderItemMatch[] = [];
  //   for await (const possibleMatch of possibleMatches) {
  //     const isMatch = firstItem.isMatch(possibleMatch);
  //     const notTaken = !ordersTaken.has(possibleMatch.id);
  //     if (isMatch && notTaken) {
  //       const opposingOrder = await this.getOrder(possibleMatch.id);
  //       if (opposingOrder?.order && opposingOrder?.orderItems) {
  //         const result = this.checkForSubSetMatch(orderItemsToFulfill, opposingOrder);
  //         if (result.isMatch) {
  //           const fulfilledOrderItems = result.fulfilledOrderItems;
  //           const remainingOrderItems = result.unfulfilledOrderItems;
  //           const updatedOrdersTaken = new Set([...ordersTaken, possibleMatch.id]);
  //           const updatedDepth = depth + 1;
  //           if (depth < Order.MAX_ONE_TO_MANY_DEPTH && remainingOrderItems.length > 0) {
  //             const subMatches = await this.searchForOneToManyMatches(
  //               remainingOrderItems,
  //               updatedOrdersTaken,
  //               updatedDepth
  //             );
  //             for (const match of subMatches) {
  //               matches.push({ orders: [...match.orders, ...fulfilledOrderItems], opposingOrders: [...match.opposingOrders, ...opposingOrder?.orderItems] });
  //             }
  //           }
  //         }
  //       }
  //     }
  //   }
  // }

  // public async searchForOneToManyMatches<T extends FirestoreOrderMatches>(): Promise<T[]> {
  //   const orderItems = await this.getOrderItems();
  //   const firstItem = orderItems[0];
  //   if (!firstItem) {
  //     throw new Error('invalid order, no order items found');
  //   }
  //   const possibleMatches = firstItem.getPossibleMatches();

  //   const matches: T[] = [];
  //   for await (const possibleMatch of possibleMatches) {
  //     /**
  //      * check if match is valid for the first item
  //      * if so, get the rest of the order and attempt to match it
  //      * with a subset of the order items.
  //      * repeat this process for an augmented order containing
  //      * the subset of the order items that were not matched
  //      * until we reach some max depth or the order is fully matched.
  //      */
  //     if (firstItem.isMatch(possibleMatch)) {
  //       const opposingOrder = await this.getOrder(possibleMatch.id);
  //       if (opposingOrder?.order && opposingOrder?.orderItems) {
  //         const result = this.checkForMatch(orderItems, opposingOrder);
  //         if (result.isMatch) {
  //           const match = this.getFirestoreOrderMatch(result.match, result.price, result.timestamp) as T;
  //           matches.push(match);
  //         }
  //       }
  //     }
  //   }
  //   return matches;
  // }

  private getFirestoreOrderMatch(
    match: OrderItemMatch[],
    price: number,
    timestamp: number
  ): FirestoreOrderMatch | FirestoreOrderMatchOneToOne {
    const ids = [
      ...new Set(
        match.flatMap(({ order, opposingOrder }) => [order.firestoreOrderItem.id, opposingOrder.firestoreOrderItem.id])
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

    for (const { order, opposingOrder } of match) {
      const collectionAddress =
        order.firestoreOrderItem.collectionAddress || opposingOrder.firestoreOrderItem.collectionAddress;
      const tokenId = order.firestoreOrderItem.tokenId || opposingOrder.firestoreOrderItem.tokenId;
      const collectionName = order.firestoreOrderItem.collectionName || opposingOrder.firestoreOrderItem.collectionName;
      const collectionImage =
        order.firestoreOrderItem.collectionImage || opposingOrder.firestoreOrderItem.collectionImage;
      const collectionSlug = order.firestoreOrderItem.collectionSlug || opposingOrder.firestoreOrderItem.collectionSlug;
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

  // private getFirestoreOrderMatchOneToMany(
  //   match: OneToManyOrderItemMatch[],
  //   price: number,
  //   timestamp: number
  // ): FirestoreOrderMatchOneToMany {
  //   const mainOrderId = match[0].order.firestoreOrderItem.id;
  //   // const mainOrderId = match.order.firestoreOrderItem.id;
  //   const opposingOrderIds = match.opposingOrders.map(({ firestoreOrderItem }) => firestoreOrderItem.id);
  //   const ids = [...new Set([mainOrderId, ...opposingOrderIds])];

  //   const orderIds = [[mainOrderId], opposingOrderIds];
  //   const [listingIds, offerIds] = match.order.firestoreOrderItem.isSellOrder ? orderIds : orderIds.reverse();

  //   type OrderItems = {
  //     [collectionAddress: string]: FirestoreOrderMatchCollection;
  //   };

  //   const orderItems: OrderItems = match.opposingOrders.reduce((acc: OrderItems, item) => {
  //     const collectionAddress = item.firestoreOrderItem.collectionAddress;
  //     const tokenId = item.firestoreOrderItem.tokenId;
  //     const collectionName = item.firestoreOrderItem.collectionName;
  //     const collectionImage = item.firestoreOrderItem.collectionImage;
  //     const collectionSlug = item.firestoreOrderItem.collectionSlug;
  //     const hasBlueCheck = item.firestoreOrderItem.hasBlueCheck;

  //     const tokens = acc[collectionAddress]?.tokens ?? {};
  //     return {
  //       ...acc,
  //       [collectionAddress]: {
  //         collectionAddress,
  //         collectionName,
  //         collectionImage,
  //         collectionSlug,
  //         hasBlueCheck,
  //         tokens: {
  //           ...tokens,
  //           [tokenId]: {
  //             tokenId,
  //             tokenName: item.firestoreOrderItem.tokenName,
  //             tokenImage: item.firestoreOrderItem.tokenImage,
  //             tokenSlug: item.firestoreOrderItem.tokenSlug,
  //             numTokens: item.firestoreOrderItem.numTokens
  //           }
  //         }
  //       }
  //     };
  //   }, {});

  //   const collectionAddresses = Object.keys(orderItems);
  //   const tokenStrings = collectionAddresses.reduce((acc: string[], collectionAddress) => {
  //     const tokens = orderItems[collectionAddress].tokens;
  //     const tokenStrings = Object.values(tokens).map((item) => `${collectionAddress}:${item.tokenId}`);
  //     return [...new Set([...acc, ...tokenStrings])];
  //   }, []);

  //   const rawId = ids.sort().join('-').trim().toLowerCase();
  //   const id = createHash('sha256').update(rawId).digest('hex');

  //   const createdAt = Date.now();
  //   const firestoreOrderMatch: FirestoreOrderMatchOneToMany = {
  //     type: FirestoreOrderMatchMethod.MatchOneToManyOrders,
  //     usersInvolved: this.getUsersInvolved(match),
  //     id,
  //     ids,
  //     collectionAddresses,
  //     chainId: match.order.firestoreOrderItem.chainId as ChainId,
  //     complicationAddress: match.order.firestoreOrderItem.complicationAddress,
  //     tokens: tokenStrings,
  //     currencyAddress: match.order.firestoreOrderItem.currencyAddress,
  //     createdAt,
  //     state: {
  //       status: createdAt >= timestamp ? FirestoreOrderMatchStatus.Active : FirestoreOrderMatchStatus.Inactive,
  //       priceValid: price,
  //       timestampValid: timestamp
  //     },
  //     matchData: {
  //       listingIds,
  //       offerIds,
  //       orderItems: orderItems
  //     }
  //   };
  //   return firestoreOrderMatch;
  // }

  public getUsersInvolved(match: OneToManyOrderItemMatch[] | OrderItemMatch[]): string[] {
    const usersAndRoles: Set<string> = new Set();
    const addUser = (firestoreOrderItem: FirestoreOrderItem) => {
      const orderSideRole = firestoreOrderItem.isSellOrder ? UserOrderRole.Lister : UserOrderRole.Offerer;
      usersAndRoles.add(firestoreOrderItem.makerAddress);
      usersAndRoles.add(`${firestoreOrderItem.makerAddress}:${orderSideRole}`);
    };

    for (const item of match) {
      if ('opposingOrder' in item) {
        addUser(item.order.firestoreOrderItem);
        addUser(item.opposingOrder.firestoreOrderItem);
      } else {
        addUser(item.order.firestoreOrderItem);
        for (const opposingOrder of item.opposingOrders) {
          addUser(opposingOrder.firestoreOrderItem);
        }
      }
    }

    return [...usersAndRoles];
  }

  public checkForMatch(
    orderItems: IOrderItem[],
    opposingOrder: { order: Order; orderItems: IOrderItem[] },
    minOrderItemsToFulfill: number
  ): { isMatch: false } | { isMatch: true; match: OrderItemMatch[]; price: number; timestamp: number } {
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
    const currentPrice = priceIntersection.getPriceAtTime(now);
    if (currentPrice === null) {
      return {
        isMatch: false
      };
    }

    return {
      isMatch: true,
      match: bestMatch.matches,
      price: currentPrice,
      timestamp: now
    };
  }

  public validateMatchForOpposingOrder(matches: OrderItemMatch[], opposingOrder: Order): boolean {
    const matchesValid = matches.every((match) => match.opposingOrder.isMatch(match.order.firestoreOrderItem));
    const isNumItemsValid = this.isNumItemsValid(opposingOrder.firestoreOrder.numItems, matches.length);
    return isNumItemsValid && matchesValid;
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
