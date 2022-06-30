import { Edge } from '../edge';
import { OrderItemNodeData, OrderNodeCollection } from '../order-node-collection';
import { Node } from '../node';
import { FirestoreOrder } from '@infinityxyz/lib/types/core';
import { getOneToManyOrderIntersection } from '../../utils/intersection';

export type Path<T> = { edges: { edge: Edge<T>; weight: number }[] };
export type Paths<T> = Path<T>[];

export class OneToManyOrderMatchSearch {
  constructor(private graph: OrderNodeCollection) {}

  public *searchForOneToManyMatches(root: OrderNodeCollection, matchingOrderNodes: OrderNodeCollection[]) {
    while (matchingOrderNodes.length > 0) {
      console.log(`Searching for matches in ${matchingOrderNodes.length} orders`);
      const graph = this.buildOneToManyGraph(root, matchingOrderNodes);
      const mainOpposingOrderNode = matchingOrderNodes.shift();

      const flowPusher = graph.streamFlow();

      for (const { flowPushed, totalFlowPushed } of flowPusher) {
        console.log(`Pushed ${flowPushed} flow. Total: ${totalFlowPushed}`);
        if (flowPushed === 0) {
          // reached a stable state
          break;
        }

        const edgesWithFlow = this.getEdgesWithNonZeroFlow();
        const orderNodesWithFlow = this.getOrdersNodesFromEdges(edgesWithFlow);
        const sortedOrderNodesWithFlow = [...orderNodesWithFlow].sort(
          (a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs
        );
        console.log(`Found ${sortedOrderNodesWithFlow.length} order nodes with flow`);
        const res = [...sortedOrderNodesWithFlow].reduce(
          (
            acc: {
              isValid: boolean;
              flow: number;
              firestoreOrders: FirestoreOrder[];
              invalidOrderNodes: OrderNodeCollection[];
            },
            orderNode
          ) => {
            const firestoreOrder = orderNode.data.order.firestoreOrder;
            const numItems = firestoreOrder.numItems;
            const flow = orderNode.incomingEdgeFlow;
            if (flow < numItems) {
              return {
                isValid: false,
                flow: acc.flow + flow,
                firestoreOrders: [...acc.firestoreOrders, firestoreOrder],
                invalidOrderNodes: [...acc.invalidOrderNodes, orderNode]
              };
            } else if (flow > numItems) {
              throw new Error(`Order flow is ${flow}. Expected flow to be at most ${numItems}`);
            }

            return {
              isValid: acc.isValid && true,
              flow: acc.flow + flow,
              firestoreOrders: [...acc.firestoreOrders, firestoreOrder],
              invalidOrderNodes: [...acc.invalidOrderNodes]
            };
          },
          { isValid: true, flow: 0, firestoreOrders: [], invalidOrderNodes: [] }
        );

        if (res.isValid && res.flow === graph.data.order.firestoreOrder.numItems) {
          const intersection = getOneToManyOrderIntersection(graph.data.order.firestoreOrder, res.firestoreOrders);
          if (intersection == null) {
            mainOpposingOrderNode?.unlink();
          } else {
            const edges = edgesWithFlow.map((item) => {
              const from = item.fromNode?.data.orderItem.firestoreOrderItem;
              const to = item.toNode?.data.orderItem.firestoreOrderItem;
              return { from, to, numItems: item.flow };
            });
            yield {
              firestoreOrder: graph.data.order.firestoreOrder,
              opposingFirestoreOrders: res.firestoreOrders,
              intersection,
              edges
            };
          }
        } else {
          res.invalidOrderNodes[0]?.unlink();
        }
      }
    }
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

  private getEdgesWithNonZeroFlow() {
    let edgesWithFlow: Edge<OrderItemNodeData>[] = [];
    for (const node of this.graph.nodes) {
      const nodeEdgesWithFlow = node.outgoingEdgesWithNonZeroFlow;
      edgesWithFlow = [...edgesWithFlow, ...nodeEdgesWithFlow];
    }

    return edgesWithFlow;
  }

  private getOrdersNodesFromEdges(edges: Iterable<Edge<OrderItemNodeData>>): Set<OrderNodeCollection> {
    const outgoingNodes = new Set<Node<OrderItemNodeData>>();
    for (const edge of edges) {
      if (edge.toNode) {
        outgoingNodes.add(edge.toNode);
      }
    }

    const orderNodes = this.getOrderNodesFromOrderItemNodes(outgoingNodes);
    return orderNodes;
  }

  private getOrderNodesFromOrderItemNodes(nodes: Iterable<Node<OrderItemNodeData>>): Set<OrderNodeCollection> {
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
