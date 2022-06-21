import { Graph } from './graph';
import { Order } from '../orders/order';
import { Node } from './node';
import { getDb } from '../firestore';
import { OrderItem } from '../orders/order-item';
import { Edge } from './edge';
import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { OrderNodeCollection } from './order-node-collection';

export class OrdersGraph extends Graph<Order> {
  graph: Graph<Order>;

  constructor(root: Node<Order>) {
    super(root);
  }

  async buildGraph() {
    const db = getDb();
    const orderIds = new Set<string>();

    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder);
    const orderNodes: OrderNodeCollection[] = [];

    /**
     * get all orders that can fulfill at least a subset of order
     */
    for(const orderItemNode of rootOrderNode.nodes) {
      const possibleMatches = orderItemNode.data.getPossibleMatches();
      for await (const match of possibleMatches) {
        if (!orderIds.has(match.id) && orderItemNode.data.isMatch(match)) {
          orderIds.add(match.id);
          const orderItem = new OrderItem(match, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const orderNode = await this.getOrderNode(firestoreOrder);
            orderNodes.push(orderNode);
          }
        }
      }
    };

    /**
     * sort order nodes by increasing start time
     */
    orderNodes.sort((a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs);

    /**
     * build edges between order items that can fulfill each other
     */
    for(const orderNode of orderNodes) {
      for(const orderItemNode of orderNode.nodes) {
        for(const rootOrderItemNode of rootOrderNode.nodes) {
          if(rootOrderItemNode.data.isMatch(orderItemNode.data.firestoreOrderItem)) {
            const edge = new Edge();
            edge.link(rootOrderItemNode, orderItemNode);
          }
        }
      }
    }
  }

  
  private async getOrderNode(firestoreOrder: FirestoreOrder) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems);
    return orderNodeCollection;
  }
}
