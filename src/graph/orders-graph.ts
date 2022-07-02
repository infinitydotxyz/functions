import { Order } from '../orders/order';
import { Node } from './node';
import { getDb } from '../firestore';
import { OrderItem } from '../orders/order-item';
import { Edge } from './edge';
import { FirestoreOrder, FirestoreOrderItem, FirestoreOrderMatches } from '@infinityxyz/lib/types/core';
import { OrderNodeCollection } from './order-node-collection';
import { getOrderIntersection } from '../utils/intersection';
import { OneToManyOrderMatchSearch } from './algorithms/one-to-many-search';
import { OrderItem as IOrderItem } from '../orders/orders.types';

export class OrdersGraph {
  constructor(public root: Node<Order>) {}

  public buildOneToManyGraph(root: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    /**
     * sort order nodes by increasing start time
     */
    matchingOrderNodes.sort(
      (a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs
    );

    for (const orderNode of matchingOrderNodes) {
      for (const orderItemNode of orderNode.nodes) {
        for (const rootOrderItemNode of root.nodes) {
          if (rootOrderItemNode.data.orderItem.isMatch(orderItemNode.data.orderItem.firestoreOrderItem)) {
            const edge = new Edge();
            edge.link(rootOrderItemNode, orderItemNode);
          }
        }
      }
    }
    return root;
  }

  public async search() {
    const rootOrderNode = await this.getRootOrderNode();
    this.verifyRootOrderNode(rootOrderNode);

    const matchingOrderNodes = await this.getMatches(rootOrderNode);
    const oneToManyMatchingOrderNodes = this.filterOneToManyMatches(matchingOrderNodes);

    const searcher = new OneToManyOrderMatchSearch(rootOrderNode, oneToManyMatchingOrderNodes);
    const matches = searcher.searchForOneToManyMatches();

    let firestoreOrderMatches: FirestoreOrderMatches[] = [];
    for (const { intersection, edges } of matches) {
      try {
        const orderItemMatches = edges.map((item) => {
          if (!item.from || !item.to) {
            throw new Error('Edge is missing from or to node');
          }
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
        firestoreOrderMatches = [...firestoreOrderMatches, orderMatch];
      } catch (err) {
        console.error(err);
      }
    }

    return firestoreOrderMatches;
  }

  private async getRootOrderNode(): Promise<OrderNodeCollection> {
    this.root.unlink();
    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder);
    return rootOrderNode;
  }

  private verifyRootOrderNode(rootOrderNode: OrderNodeCollection) {
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

  private async getMatches(rootOrderNode: OrderNodeCollection): Promise<OrderNodeCollection[]> {
    const db = getDb();
    const orderIds = new Set<string>();
    const orderNodes: OrderNodeCollection[] = [];
    for (const orderItemNode of rootOrderNode.nodes) {
      const possibleMatches = orderItemNode.data.orderItem.getPossibleMatches();
      for await (const possibleMatch of possibleMatches) {
        const doesMatch = this.checkPossibleMatch(orderItemNode.data.orderItem, possibleMatch);
        if(doesMatch && !orderIds.has(possibleMatch.id) ) {
          orderIds.add(possibleMatch.id);
          const orderItem = new OrderItem(possibleMatch, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if(firestoreOrder) {
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
    if(!isMatch) {
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
