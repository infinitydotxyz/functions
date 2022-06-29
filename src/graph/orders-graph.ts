import { Order } from '../orders/order';
import { Node } from './node';
import { getDb } from '../firestore';
import { OrderItem } from '../orders/order-item';
import { Edge } from './edge';
import { FirestoreOrder, FirestoreOrderMatches } from '@infinityxyz/lib/types/core';
import { OrderNodeCollection } from './order-node-collection';
import { getOrderIntersection } from '../utils/intersection';
import { OneToManyOrderMatchSearch } from './algorithms/search';

export class OrdersGraph {
  constructor(public root: Node<Order>) {}

  public async search() {
    const { rootOrderNode, matchingOrderNodes } = await this.getOneToManyGraph();
    const searcher = new OneToManyOrderMatchSearch(rootOrderNode);

    const matches = searcher.searchForOneToManyMatches(rootOrderNode, matchingOrderNodes);

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

  public async getOneToManyGraph(): Promise<{
    rootOrderNode: OrderNodeCollection;
    matchingOrderNodes: OrderNodeCollection[];
  }> {
    this.root.unlink();
    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder);
    const isFullySpecified = Order.isFullySpecified(rootOrderNode.data.orderItems);
    if (!isFullySpecified) {
      throw new Error(
        `Attempted to build graph for order that is not fully specified. Order: ${this.root.data.firestoreOrder.id}`
      );
    }

    const matchingOrderNodes = await this.getMatches(rootOrderNode);
    const subsetMatchingOrderNodes = matchingOrderNodes.filter((item) => {
      return this.root.data.firestoreOrder.numItems >= item.data.order.firestoreOrder.numItems;
    });
    return { rootOrderNode, matchingOrderNodes: subsetMatchingOrderNodes };
  }

  private async getMatches(rootOrderNode: OrderNodeCollection): Promise<OrderNodeCollection[]> {
    const orderNodes: OrderNodeCollection[] = [];
    const db = getDb();
    const orderIds = new Set<string>();
    for (const orderItemNode of rootOrderNode.nodes) {
      const possibleMatches = orderItemNode.data.orderItem.getPossibleMatches();
      for await (const match of possibleMatches) {
        const isMatch = orderItemNode.data.orderItem.isMatch(match);
        if (!orderIds.has(match.id) && isMatch) {
          orderIds.add(match.id);
          const orderItem = new OrderItem(match, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (
            firestoreOrder &&
            getOrderIntersection(rootOrderNode.data.order.firestoreOrder, firestoreOrder) !== null
          ) {
            const orderNode = await this.getOrderNode(firestoreOrder);
            orderNodes.push(orderNode);
          }
        }
      }
    }
    return orderNodes;
  }

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

  private async getOrderNode(firestoreOrder: FirestoreOrder) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems);
    return orderNodeCollection;
  }
}