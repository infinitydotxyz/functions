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
  UserOrderRole
} from '@infinityxyz/lib/types/core';
import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { OrderItem } from './order-item';
import { OneToManyOrderItemMatch, OrderItem as IOrderItem, OrderItemMatch } from './orders.types';
import { createHash } from 'crypto';
import { Node } from '../graph/node';
import { OrdersGraph } from '../graph/orders-graph';
import { OneToOneMatch } from '../graph/algorithms/one-to-one-search';

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
    }, orderItems.length > 0);
  }

  public async searchForMatches(): Promise<{ matches: FirestoreOrderMatches[]; requiresScan: FirestoreOrder[] }> {
    /**
     * get the order items for this order
     */
    const orderItems = await this.getOrderItems();
    const firstItem = orderItems[0]; // we don't have to match every item with another item
    if (!firstItem) {
      throw new Error('invalid order, no order items found');
    }

    /**
     * get the possible matches for every order item in the order
     */
    const possibilities = await this.getPossibleMatches(orderItems);

    const node = new Node(this, this.firestoreOrder.numItems);
    const graph = new OrdersGraph(node);

    const { matches, requiresScan } = await graph.search(possibilities);

    console.table(
      matches.map((item) => {
        return {
          id: item.id,
          type: item.type,
          numOrders: item.ids.length,
          numUsers: item.usersInvolved.filter((item) => !item.includes(':')).length
        };
      })
    );

    return { matches, requiresScan };
  }

  private async getPossibleMatches(
    orderItems: IOrderItem[]
  ): Promise<{ orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]> {
    const res: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[] = [];
    for (const orderItem of orderItems) {
      const possibleMatches: FirestoreOrderItem[] = [];
      const iterator = orderItem.getPossibleMatches(); // TODO should erc1155 use the num tokens constraint?
      for await (const possibleMatch of iterator) {
        possibleMatches.push(possibleMatch);
      }
      res.push({ orderItem, possibleMatches });
    }
    return res;
  }

  public getFirestoreOrderMatch(
    orderMatch: OneToOneMatch,
    price: number,
    timestamp: number
  ): FirestoreOrderMatch | FirestoreOrderMatchOneToOne {
    const matches = orderMatch.matches;
    const ids = [
      ...new Set(
        matches.flatMap(({ orderItem, opposingOrderItem }) => [
          orderItem.firestoreOrderItem.id,
          opposingOrderItem.firestoreOrderItem.id
        ])
      )
    ];

    const rawId = matches
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

    const firstOrder = matches[0].orderItem;
    const firstOpposingOrder = matches[0].opposingOrderItem;
    const [sampleListing, sampleOffer] = firstOrder.firestoreOrderItem.isSellOrder
      ? [firstOrder.firestoreOrderItem, firstOpposingOrder.firestoreOrderItem]
      : [firstOpposingOrder.firestoreOrderItem, firstOrder.firestoreOrderItem];

    const isOneToOne =
      matches.length === 1 &&
      orderMatch.orderItems.length === 1 &&
      orderMatch.opposingOrderItems.length === 1 &&
      matches[0].orderItem.firestoreOrderItem.numItems === 1 &&
      matches[0].opposingOrderItem.firestoreOrderItem.numItems === 1 &&
      !!orderMatch.orderItems[0].firestoreOrderItem.tokenId &&
      !!orderMatch.opposingOrderItems[0].firestoreOrderItem.tokenId;

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
      usersInvolved: this.getUsersInvolved(matches),
      state: {
        status: createdAt >= timestamp ? FirestoreOrderMatchStatus.Active : FirestoreOrderMatchStatus.Inactive,
        priceValid: price,
        timestampValid: timestamp
      }
    };

    for (const { orderItem, opposingOrderItem } of matches) {
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
    matches: { orderItem: FirestoreOrderItem; opposingOrderItem: FirestoreOrderItem }[],
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
    }, {});

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

  public getUsersInvolved(
    match:
      | OneToManyOrderItemMatch[]
      | OrderItemMatch[]
      | { orderItem: FirestoreOrderItem; opposingOrderItem: FirestoreOrderItem }[]
  ): string[] {
    const usersAndRoles: Set<string> = new Set();
    const addUser = (firestoreOrderItem: FirestoreOrderItem) => {
      const orderSideRole = firestoreOrderItem.isSellOrder ? UserOrderRole.Lister : UserOrderRole.Offerer;
      usersAndRoles.add(firestoreOrderItem.makerAddress);
      usersAndRoles.add(`${firestoreOrderItem.makerAddress}:${orderSideRole}`);
    };

    for (const item of match) {
      if ('opposingOrderItem' in item) {
        if ('orderStatus' in item.opposingOrderItem) {
          addUser(item.opposingOrderItem);
        } else {
          addUser(item.opposingOrderItem.firestoreOrderItem);
        }
        if ('orderStatus' in item.orderItem) {
          addUser(item.orderItem);
        } else {
          addUser(item.orderItem.firestoreOrderItem);
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

  async getOrderItems(): Promise<IOrderItem[]> {
    const firestoreOrderItems = await this.getFirestoreOrderItems();

    const orderItems = firestoreOrderItems
      .map((firestoreOrderItem) => {
        return new OrderItem(firestoreOrderItem, this.db).applyConstraints();
      })
      .sort((itemA, itemB) => itemB.constraintScore - itemA.constraintScore);

    return orderItems;
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

  async markScanned(): Promise<void> {
    try {
      const update: Partial<FirestoreOrder> = {
        enqueued: false,
        lastScannedAt: Date.now()
      };
      await this.ref.set(update, { merge: true });
    } catch (err) {
      console.error(err);
    }
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
