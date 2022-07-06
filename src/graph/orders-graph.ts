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
import { OneToManyMatch, OneToManyOrderMatchSearch } from './algorithms/one-to-many-search';
import { OrderItem as IOrderItem } from '../orders/orders.types';
import { OneToOneOrderMatchSearch } from './algorithms/one-to-one-search';

export class OrdersGraph {
  constructor(public root: Node<Order>) {}

  public async search(
    possibleMatches?: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]
  ): Promise<{ matches: FirestoreOrderMatches[]; requiresScan: FirestoreOrder[] }> {
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
    console.log(`Found: ${possibleMatches.length} possible matches`);
    const matchingOrderNodes = await this.getMatches(possibleMatches);
    console.log(`Found: ${matchingOrderNodes.length} matching orders`);
    const oneToOne = this.searchOneToOne(rootOrderNode, matchingOrderNodes);
    console.log(`Found: ${oneToOne.length} one to one matches`);
    const oneToManyMatches = this.searchOneToMany(rootOrderNode, matchingOrderNodes);
    console.log(`Found: ${oneToManyMatches.length} one to many matches`);

    const firestoreMatches = [...oneToOne, ...oneToManyMatches];

    let requiresScan: FirestoreOrder[] = [];
    if (rootOrderNode.data.order.firestoreOrder.numItems === 1) {
      requiresScan = matchingOrderNodes
        .filter((item) => item.data.order.firestoreOrder.numItems > 1)
        .map((item) => item.data.order.firestoreOrder);
    }

    return { matches: firestoreMatches, requiresScan };
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
      console.log(err);
      return [];
    }
  }

  public searchOneToMany(rootOrderNode: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    try {
      const isValid = this.verifyOneToManyRootOrderNode(rootOrderNode);
      if (!isValid) {
        return [];
      }
      const oneToManyMatchingOrderNodes = this.filterOneToManyMatches(matchingOrderNodes);
      const searcher = new OneToManyOrderMatchSearch(rootOrderNode, oneToManyMatchingOrderNodes);
      const matches = searcher.search();

      const firestoreOrderMatches: FirestoreOrderMatches[] = matches.map((item) => {
        return this.transformOrderMatchToFirestoreOrderMatch(item);
      });

      return firestoreOrderMatches;
    } catch (err) {
      console.log(err);
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
    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder, true);
    return rootOrderNode;
  }

  private verifyOneToManyRootOrderNode(rootOrderNode: OrderNodeCollection) {
    const isFullySpecified = Order.isFullySpecified(rootOrderNode.data.orderItems);

    const validNumItems = rootOrderNode.data.order.firestoreOrder.numItems > 1;
    return isFullySpecified && validNumItems;
  }

  private filterOneToManyMatches(matches: OrderNodeCollection[]) {
    return matches.filter((item) => {
      // return this.root.data.firestoreOrder.numItems > item.data.order.firestoreOrder.numItems;
      return item.data.order.firestoreOrder.numItems === 1;
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
        const validationResponse = orderItem.isMatch(possibleMatch);
        if (validationResponse.isValid && !orderIds.has(possibleMatch.id)) {
          orderIds.add(possibleMatch.id);
          const orderItem = new OrderItem(possibleMatch, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const orderNode = await this.getOrderNode(firestoreOrder, false);
            orderNodes.push(orderNode);
          }
        } else if(!validationResponse.isValid) {
          console.log(validationResponse.reasons); // TODO remove
        }
      }
    }
    return orderNodes;
  }

  private async getOrderNode(firestoreOrder: FirestoreOrder, isRoot: boolean) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems, !isRoot);
    return orderNodeCollection;
  }
}
