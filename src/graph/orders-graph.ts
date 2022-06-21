import { Graph } from './graph';
import { OrderItem as IOrder } from '../orders/orders.types';
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
    const orderItems = await this.root.data.getOrderItems();
    const db = getDb();
    const orderIds = new Set<string>();

    // const orderNodes: OrderNodeCollection[] = [];

    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder);

    // for(const orderItemNode of rootOrderNode.nodes) {
    //   orderItemNode.
    // }

    for (const orderItem of orderItems) {
      const matches = orderItem.getPossibleMatches();
      for await (const match of matches) {
        if (!orderIds.has(match.id)) {
          const orderItem = new OrderItem(match, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const orderNode = await this.getOrderNode(firestoreOrder);
            // orderNodes.push(orderNode);
          }
        }
      }
    }

    ;
  }

  
  private async getOrderNode(firestoreOrder: FirestoreOrder) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems);
    return orderNodeCollection;
  }
}
