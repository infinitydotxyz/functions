import { Edge } from '../edge';
import { Node } from '../node';
import { OrderItemNodeData, OrderNodeCollection } from '../order-node-collection';

export abstract class OrderMatchSearch<T> {
  constructor(protected rootOrderNode: OrderNodeCollection, protected matchingOrderNodes: OrderNodeCollection[]) {}

  public abstract search(): T[];

  protected connectNodes(root: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    root.unlink();

    for (const orderNode of matchingOrderNodes) {
      orderNode.unlink();
    }

    matchingOrderNodes.sort(
      (a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs
    );

    for (const orderNode of matchingOrderNodes) {
      for (const orderItemNode of orderNode.nodes) {
        for (const rootOrderItemNode of root.nodes) {
          if (
            rootOrderItemNode.data.orderItem.isMatch(orderItemNode.data.orderItem.firestoreOrderItem) &&
            orderItemNode.data.orderItem.isMatch(rootOrderItemNode.data.orderItem.firestoreOrderItem)
          ) {
            const edge = new Edge();
            edge.link(rootOrderItemNode, orderItemNode);
          }
        }
      }
    }

    return root;
  }

  protected getEdgesWithNonZeroFlow(graph: OrderNodeCollection) {
    let edgesWithFlow: Edge<OrderItemNodeData>[] = [];
    for (const node of graph.nodes) {
      const nodeEdgesWithFlow = node.outgoingEdgesWithNonZeroFlow;
      edgesWithFlow = [...edgesWithFlow, ...nodeEdgesWithFlow];
    }

    return edgesWithFlow;
  }

  protected getOrdersNodesFromEdges(edges: Iterable<Edge<OrderItemNodeData>>): Set<OrderNodeCollection> {
    const outgoingNodes = new Set<Node<OrderItemNodeData>>();
    for (const edge of edges) {
      if (edge.toNode) {
        outgoingNodes.add(edge.toNode);
      }
    }

    const orderNodes = this.getOrderNodesFromOrderItemNodes(outgoingNodes);
    return orderNodes;
  }

  protected getOrderNodesFromOrderItemNodes(nodes: Iterable<Node<OrderItemNodeData>>): Set<OrderNodeCollection> {
    const orderNodes = new Set<OrderNodeCollection>();
    for (const node of nodes) {
      const orderNode = node.data.orderNode;
      if (orderNode) {
        orderNodes.add(orderNode);
      }
    }
    return orderNodes;
  }
}
