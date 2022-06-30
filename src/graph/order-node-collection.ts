import { Order } from '../orders/order';
import { NodeCollection } from './node-collection';
import { OrderItem as IOrderItem } from '../orders/orders.types';
import { Node } from './node';
import { Edge } from './edge';

interface Data {
  order: Order;
  orderItems: IOrderItem[];
}

export interface OrderItemNodeData {
  orderItem: IOrderItem;
  orderNode: OrderNodeCollection;
}

export class OrderNodeCollection extends NodeCollection<Data, OrderItemNodeData> {
  constructor(order: Order, orderItems: IOrderItem[]) {
    super(
      {
        order,
        orderItems
      },
      order.firestoreOrder.numItems
    );
    this.initNodes();
  }

  public get incomingEdgeFlow() {
    let flow = 0;
    for (const node of this.nodes) {
      flow += node.incomingEdgeFlow;
    }

    return flow;
  }

  public get outgoingEdgeFlow(): number {
    let flow = 0;
    for (const node of this.nodes) {
      flow += node.outgoingEdgeFlow;
    }

    return flow;
  }

  public get outgoingEdgesWithNonZeroFlow(): Edge<OrderItemNodeData>[] {
    return [...this.nodes].flatMap((node) => node.outgoingEdgesWithNonZeroFlow);
  }

  public get incomingEdgesWithNonZeroFlow(): Edge<OrderItemNodeData>[] {
    return [...this.nodes].flatMap((node) => node.incomingEdgesWithNonZeroFlow);
  }

  private initNodes() {
    for (const orderItem of this.data.orderItems) {
      const orderItemMaxFlow = orderItem.maxNumItemsContribution;
      const node = new Node({ orderItem, orderNode: this }, orderItemMaxFlow);
      this.add(node);
    }
  }
}
