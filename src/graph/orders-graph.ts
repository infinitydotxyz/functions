import { Graph } from './graph';
import { OrderItem as IOrder } from '../orders/orders.types';
import { Order } from '../orders/order';
import { Node } from './node';
import { getDb } from '../firestore';
import { OrderItem } from '../orders/order-item';
import { Edge } from './edge';
import { FirestoreOrder } from '@infinityxyz/lib/types/core';

export class OrdersGraph extends Graph<Order> {
  graph: Graph<Order>;

  constructor(root: Node<Order>) {
    super(root);
  }

  async buildGraph() {
    const orderItems = await this.root.data.getOrderItems();
    const db = getDb();
    const orders = new Set();

    for (const orderItem of orderItems) {
      const node = new Node(orderItem);
      const orderItemGraph = new Graph(node);
      const matches = orderItem.getPossibleMatches();
      for await (const match of matches) {
        if (!orders.has(match.id)) {
          const orderItem = new OrderItem(match, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const order = new Order(firestoreOrder);
            const orderNode = new Node(order);
            orders.add(order.firestoreOrder.id);
            const orderItems = await order.getOrderItems();
            for(const orderItem of orderItems) {
                const edge = new Edge<IOrder>();
                const outputNode = new Node(orderItem);
                edge.link(node, outputNode);
                orderItemGraph.add(edge);
            }
          }
        }
        const matchNode = new Node(match);
      }
    }
  }
  
  async function getOrderNode(firestoreOrder: FirestoreOrder) {
    const order = new Order(firestoreOrder);
    const orderNodeData = {
        order,
        orderItems: []
    }
    const orderNode = new Node()
  }
}
