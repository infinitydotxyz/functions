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
    super({
      order,
      orderItems
    });
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

  public pushFlow(): { flowPushed: number } {
    let totalFlow = this.outgoingEdgeFlow;
    let totalFlowPushed = 0;
    const maxFlow = this.data.order.firestoreOrder.numItems;
    const nodes = [...this.nodes];
    let index = 0;

    while (totalFlow < maxFlow) {
      const node = nodes[index];
      if (!node) {
        break;
      }
      const flowToPush = Math.min(maxFlow - totalFlow, node.maxFlow);
      const { flowPushed } = node.pushFlow(flowToPush);
      totalFlow += flowPushed;
      index += 1;
      totalFlowPushed += flowPushed;
    }

    return { flowPushed: totalFlowPushed };
  }

  public *streamFlow(): Generator<
    {
      flowPushed: number;
      totalFlowPushed: number;
    },
    void,
    unknown
  > {
    let totalFlowPushed = 0;
    const maxFlow = this.data.order.firestoreOrder.numItems;
    const nodes = [...this.nodes];

    while (nodes.length > 0) {
      let flowPushedToAllNodes = 0;
      for (const node of nodes) {
        const totalFlow = this.outgoingEdgeFlow;
        const flowRemaining = maxFlow - totalFlow;
        const flowToPush = Math.min(flowRemaining, node.maxFlow);
        const { flowPushed } = node.pushFlow(flowToPush);
        totalFlowPushed += flowPushed;
        flowPushedToAllNodes += flowPushed;
      }
      if (flowPushedToAllNodes === 0) {
        break;
      }
      yield { flowPushed: flowPushedToAllNodes, totalFlowPushed };
    }
  }

  private initNodes() {
    for (const orderItem of this.data.orderItems) {
      const orderItemMaxFlow = orderItem.maxNumItemsContribution;
      const node = new Node({ orderItem, orderNode: this }, orderItemMaxFlow);
      this.add(node);
    }
  }
}
