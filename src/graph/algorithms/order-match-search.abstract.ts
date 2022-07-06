import { Edge } from '../edge';
import { Node } from '../node';
import { OrderItemNodeData, OrderNodeCollection } from '../order-node-collection';

export abstract class OrderMatchSearch<T> {
  constructor(
    protected rootOrderNode: OrderNodeCollection,
    protected matchingOrderNodes: OrderNodeCollection[],
    protected log?: (message: string) => void
  ) {}

  public abstract search(): T[];

  protected connectNodes(root: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    root.unlink();

    for (const orderNode of matchingOrderNodes) {
      orderNode.unlink();
    }

    matchingOrderNodes.sort(
      (a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs
    );
    this.log?.(
      `Building graph from ${matchingOrderNodes.length} orders. Root order has ${root.nodes.size} order items`
    );
    for (const orderNode of matchingOrderNodes) {
      this.log?.(`  Checking order node ${orderNode.data.order.firestoreOrder.id} size: (${orderNode.nodes.size})`);
      for (const orderItemNode of orderNode.nodes) {
        for (const rootOrderItemNode of root.nodes) {
          this.log?.(
            `    Root token id: ${rootOrderItemNode.data.orderItem.firestoreOrderItem.tokenId} Opposing order item token id: ${orderItemNode.data.orderItem.firestoreOrderItem.tokenId}`
          );
          const rootValidationResponse = rootOrderItemNode.data.orderItem.isMatch(
            orderItemNode.data.orderItem.firestoreOrderItem
          );
          const opposingOrderValidationResponse = orderItemNode.data.orderItem.isMatch(
            rootOrderItemNode.data.orderItem.firestoreOrderItem
          );
          if (rootValidationResponse.isValid && opposingOrderValidationResponse.isValid) {
            this.log?.(`      Valid edge`);
            const edge = new Edge();
            edge.link(rootOrderItemNode, orderItemNode);
          } else {
            const rootReasons = rootValidationResponse.isValid ? [] : rootValidationResponse.reasons;
            const opposingOrderReasons = opposingOrderValidationResponse.isValid
              ? []
              : opposingOrderValidationResponse.reasons;
            this.log?.(`      Invalid Edge: root - opposing order item: ${rootReasons.join(', ')}`);
            this.log?.(`      Invalid Edge: opposing order - root order item: ${opposingOrderReasons.join(', ')}`);
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
