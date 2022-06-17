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

type OrderMatch = {
  order: Order;
  orderItems: IOrderItem[];
  matches: OrderItemMatch[];
};
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

    const orderSubsetMatches = new Map<string, { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[], price: number, timestamp: number }[]>();
    const fullMatches: { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[], price: number, timestamp: number  }[] = [];

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
              const matches = this.checkForMatches(
                opposingOrder?.orderItems,
                {
                  order: this,
                  orderItems
                },
                1
              ); // 1 to get all partial matches 

              const opposingOrderPartialMatches = matches.map(({match, price, timestamp}) => {
                return {
                  ...opposingOrder,
                  matches: match,
                  price, 
                  timestamp
                }
              }).filter((item) => item.matches.length < this.firestoreOrder.numItems); // filter out full matches 
              orderSubsetMatches.set(orderId, opposingOrderPartialMatches);

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

    const singleMatches = fullMatches.reduce(
      (acc: (FirestoreOrderMatch | FirestoreOrderMatchOneToOne)[], item) => {
          const orderMatch = this.getFirestoreOrderMatch(item.matches, item.price, item.timestamp);
          return [...acc, orderMatch];
      },
      []
    );

    // combine subset matches to form full matches
    // for(const [, opposingOrderSubsetMatch] of orderSubsetMatches) {

    // }


    // const manyMatches = manyOrderMatches.reduce(
    //   (acc: (FirestoreOrderMatchOneToMany)[], item) => {
    //     item.matches.map((match) => {
    //       match.opposingOrder.o
    //     })
    //     const intersection = getOneToManyOrderIntersection(this.firestoreOrder, item.matches.map((item) => item.order.fire));
    //     if (intersection !== null) {
    //       const orderMatch = this.getFirestoreOrderMatch(item., intersection.price, intersection.timestamp);
    //       return [...acc, orderMatch];
    //     }
    //     return acc;
    //   },
    //   []
    // );
    return { matches: singleMatches };
  }



  private generateFullMatches(partialMatchesByOrder: Map<string, { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[], price: number, timestamp: number }[]>) {
    /**
     * matches are conflicting if 
     * 1. they are from the same order
     * 2. two of their 
     */
    // const generateNonConflictingMatches = (remainingOrders: Map<string, { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[], price: number, timestamp: number }[]>, matchesByOrderItemFulfilled: Map<string, OrderItemMatch[]>) => {
    //   const orderMatches = [...remainingOrders.values()][0];
    //   if(!orderMatches) {
    //     return matchesByOrderItemFulfilled;
    //   }
    //   for(const { order, orderItems, matches, price, timestamp } of orderMatches) {
    //   }
    // }
    // for(const [, orderMatches] of partialMatchesByOrder) {
    //   for(const { order, orderItems, matches, price, timestamp} of orderMatches) {
        
    //   }
    // }


  }

  /**
   * takes an array of orders with their corresponding order items and an array of matches
   * that they fulfill within this order. each order can be fully fulfilled by this order
   *
   * goal is to find the shortest paths that fulfill the order up to some max depth (i.e. number of orders)
   *
   * TODO how do we determine max depth? how will gas be affected?
   *
   * @param orderItems - the order items in the order that we are attempting to fulfill
   */
  private generateMatches(
    orderItems: IOrderItem[],
    orderSubsetMatches: { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[] }[]
  ): { singleOrderMatches: OrderMatch[]; manyOrderMatches: OrderMatch[] } {
    const orderItemIds = [...new Set(orderItems.map((item) => item.id))];

    const getComplementaryOrderItemIds = (orderIds: string[]) => {
      const orderIdSet = new Set(orderIds);
      const complementaryOrderItemIds = orderItemIds.filter((id) => !orderIdSet.has(id));
      return complementaryOrderItemIds;
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

    /**
     * provide
     */
    const ordersByMatch = new Map<
      OrderItemMatch,
      { order: Order; orderItems: IOrderItem[]; matches: OrderItemMatch[] }
    >();
    for (const orderSubsetMatch of partialOrderMatches) {
      for (const match of orderSubsetMatch.matches) {
        ordersByMatch.set(match, orderSubsetMatch);
      }
    }

    const matchesByOrderItemFulfilled = new Map<string, OrderItemMatch[]>();
    for (const orderSubsetMatch of partialOrderMatches) {
      for (const match of orderSubsetMatch.matches) {
        const id = match.orderItem.id;
        const existingMatches = matchesByOrderItemFulfilled.get(id) ?? [];
        existingMatches.push(match);
        matchesByOrderItemFulfilled.set(id, existingMatches);
      }
    }

    for (const subsetMatch of partialOrderMatches) {
      const partialOpposingOrder = subsetMatch.order;
      const partialOpposingOrderItems = subsetMatch.orderItems;
      const partialMatches = subsetMatch.matches;
      const orderIdsInPartialMatches = partialMatches.map((item) => item.orderItem.id);
      const complementaryOrderItemIds = getComplementaryOrderItemIds(orderIdsInPartialMatches);
      const unmatchedOrderItems = complementaryOrderItemIds.map((id) => {
        const matchesForOrderItem = matchesByOrderItemFulfilled.get(id) ?? [];
        const orderItem = orderItemsById.get(id);
        return {
          orderItem,
          matches: matchesForOrderItem
        };
      });
    }

    /**
     * how do we generate combinations of order items such that
     * the combinations are not conflicting (i.e. no order items are matched by multiple orders)
     * the number of order items constraint is fulfilled
     * the price/time constraint is fulfilled
     *
     *
     * create a recursive function that takes an array of matches containing a
     */
    // const numItems = this.firestoreOrder.numItems;
    // const maxDepth = 5;
    // const combinePartialMatches = (
    //   unfulfilledOrder: { orderItems: IOrderItem[] },
    //   remainingPartialOrders: Set<string>
    // ) => {};

    // combinePartialMatches({orderItems}, remainingPartialOrders: )

    // const generateFullMatches = (orderItemMatches: OrderItemMatch[], unfulfilledOrderItems: { unfulfilledOrderItem: IOrderItem, possibleMatches: IOrderItem[] }[], depth = 0) => {
    // if(depth >= maxDepth) {
    //     return [];
    //   }

    //   const orderIdsInMatches = orderItemMatches.map((item) => item.orderItem.id);
    //   const complimentaryOrderItemIds = getComplementaryOrderItemIds(orderIdsInMatches);
    //   // const unfulfilledOrderItemIds = unfulfilledOrderItems.map((orderItem) => orderItem.id);

    //   for(const unfulfilledOrderItem of unfulfilledOrderItems) {
    //     const id = unfulfilledOrderItem.id;
    //     const possibleMatches = matchesByOrderItemFulfilled.get(id) ?? [];

    //     for(const possibleMatch of possibleMatches) {

    //     }
    //   }

    // }

    return {
      singleOrderMatches: fullOrderMatches,
      manyOrderMatches: [] // TODO
    };
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
      if ('opposingOrderItem' in item) {
        addUser(item.orderItem.firestoreOrderItem);
        addUser(item.opposingOrderItem.firestoreOrderItem);
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
