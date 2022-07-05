import { Order } from '../orders/order';
import { Node } from './node';
import { getDb } from '../firestore';
import { OrderItem } from '../orders/order-item';
import {
  FirestoreOrder,
  FirestoreOrderItem,
  FirestoreOrderMatches,
  FirestoreOrderMatchOneToMany
} from '@infinityxyz/lib/types/core';
import { OrderNodeCollection } from './order-node-collection';
import { getOrderIntersection } from '../utils/intersection';
import { OneToManyMatch, OneToManyOrderMatchSearch } from './algorithms/one-to-many-search';
import { OrderItem as IOrderItem } from '../orders/orders.types';
import { OneToOneOrderMatchSearch } from './algorithms/one-to-one-search';

export class OrdersGraph {
  constructor(public root: Node<Order>) {}

  public async search(
    possibleMatches?: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]
  ): Promise<FirestoreOrderMatches[]> {
    const rootOrderNode = await this.getRootOrderNode();

    if (!possibleMatches) {
      possibleMatches = [];
      for (const orderItemNode of rootOrderNode.nodes) {
        const iterator = orderItemNode.data.orderItem.getPossibleMatches();
        const orderItemPossibleMatches: FirestoreOrderItem[] = [];
        for await (const possibleMatch of iterator) {
          orderItemPossibleMatches.push(possibleMatch);
        }
        possibleMatches.push({
          orderItem: orderItemNode.data.orderItem,
          possibleMatches: orderItemPossibleMatches
        });
      }
    }

    const matchingOrderNodes = await this.getMatches(possibleMatches);
    const oneToOne = this.searchOneToOne(rootOrderNode, matchingOrderNodes);
    const oneToManyMatches = this.searchOneToMany(rootOrderNode, matchingOrderNodes);

    const firestoreMatches = [...oneToOne, ...oneToManyMatches];

    return firestoreMatches;
  }

  public searchOneToOne(rootOrderNode: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    try {
      const searcher = new OneToOneOrderMatchSearch(rootOrderNode, matchingOrderNodes);
      const matches = searcher.search();
      const firestoreMatches = matches.map((item) =>
        rootOrderNode.data.order.getFirestoreOrderMatch(item.matches, item.price, item.timestamp)
      );

      return firestoreMatches;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  public searchOneToMany(rootOrderNode: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    try {
      this.verifyOneToManyRootOrderNode(rootOrderNode);
      const oneToManyMatchingOrderNodes = this.filterOneToManyMatches(matchingOrderNodes);
      const searcher = new OneToManyOrderMatchSearch(rootOrderNode, oneToManyMatchingOrderNodes);
      const matches = searcher.search();

      const firestoreOrderMatches: FirestoreOrderMatches[] = matches.map((item) => {
        return this.transformOrderMatchToFirestoreOrderMatch(item);
      });

      return firestoreOrderMatches;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  private transformOrderMatchToFirestoreOrderMatch({
    intersection,
    edges
  }: OneToManyMatch): FirestoreOrderMatchOneToMany {
    const orderItemMatches = edges.map((item) => {
      return {
        orderItem: item.from,
        opposingOrderItem: item.to
      };
    });
    const orderMatch = this.root.data.getFirestoreOrderMatchOneToMany(
      orderItemMatches,
      intersection.price,
      intersection.timestamp
    );
    return orderMatch;
  }

  private async getRootOrderNode(): Promise<OrderNodeCollection> {
    this.root.unlink();
    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder);
    return rootOrderNode;
  }

  private verifyOneToManyRootOrderNode(rootOrderNode: OrderNodeCollection) {
    const isFullySpecified = Order.isFullySpecified(rootOrderNode.data.orderItems);
    if (!isFullySpecified) {
      throw new Error(
        `Attempted to build graph for order that is not fully specified. Order: ${this.root.data.firestoreOrder.id}`
      );
    }
  }

  private filterOneToManyMatches(matches: OrderNodeCollection[]) {
    return matches.filter((item) => {
      return this.root.data.firestoreOrder.numItems >= item.data.order.firestoreOrder.numItems;
    });
  }

  private async getMatches(
    possibilities: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]
  ): Promise<OrderNodeCollection[]> {
    const db = getDb();
    const orderIds = new Set<string>();
    const orderNodes: OrderNodeCollection[] = [];
    for (const { orderItem, possibleMatches } of possibilities) {
      for (const possibleMatch of possibleMatches) {
        const doesMatch = this.checkPossibleMatch(orderItem, possibleMatch);
        if (doesMatch && !orderIds.has(possibleMatch.id)) {
          orderIds.add(possibleMatch.id);
          const orderItem = new OrderItem(possibleMatch, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const orderNode = await this.getOrderNode(firestoreOrder);
            orderNodes.push(orderNode);
          }
        }
      }
    }
    return orderNodes;
  }

  private checkPossibleMatch(rootOrderItem: IOrderItem, possibleMatch: FirestoreOrderItem) {
    const isMatch = rootOrderItem.isMatch(possibleMatch);
    if (!isMatch) {
      return false;
    }

    const intersection = getOrderIntersection(rootOrderItem.firestoreOrderItem, possibleMatch);
    const intersects = intersection !== null;

    return intersects;
  }

  private async getOrderNode(firestoreOrder: FirestoreOrder) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems);
    return orderNodeCollection;
  }
}
