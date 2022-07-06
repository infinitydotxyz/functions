import { OrderNodeCollection } from '../order-node-collection';
import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { getOneToManyOrderIntersection } from '../../utils/intersection';
import { OrderPriceIntersection } from '../../utils/intersection.types';
import { OrderMatchSearch } from './order-match-search.abstract';

export type OneToManyMatch = {
  firestoreOrder: FirestoreOrder;
  opposingFirestoreOrders: FirestoreOrder[];
  intersection: OrderPriceIntersection;
  edges: { from: FirestoreOrderItem; to: FirestoreOrderItem; numItems: number }[];
};

export class OneToManyOrderMatchSearch extends OrderMatchSearch<OneToManyMatch> {
  public search(): OneToManyMatch[] {
    const results: OneToManyMatch[] = [];
    const iterator = this.searchForOneToManyMatches();
    for (const item of iterator) {
      results.push(item);
    }
    return results;
  }

  private *searchForOneToManyMatches(): Generator<OneToManyMatch, void, void> {
    const matchingOrderNodes = [...this.matchingOrderNodes];
    while (matchingOrderNodes.length > 0) {
      console.log(`Searching for matches in ${matchingOrderNodes.length} orders`);
      const graph = this.connectNodes(this.rootOrderNode, matchingOrderNodes);
      const mainOpposingOrderNode = matchingOrderNodes.shift();
      console.log(`Found: ${graph.outgoingEdges.length} edges`);
      const flowPusher = graph.streamFlow();

      for (const { flowPushed, totalFlowPushed } of flowPusher) {
        console.log(`Pushed ${flowPushed} flow. Total: ${totalFlowPushed}`);
        if (flowPushed === 0) {
          // reached a stable state
          break;
        }

        const edgesWithFlow = this.getEdgesWithNonZeroFlow(graph);
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
            const edges = edgesWithFlow
              .map((item) => {
                const from = item.fromNode?.data.orderItem.firestoreOrderItem;
                const to = item.toNode?.data.orderItem.firestoreOrderItem;
                if (!from || !to) {
                  return null;
                }
                return { from, to, numItems: item.flow };
              })
              .filter((item) => item != null) as {
              from: FirestoreOrderItem;
              to: FirestoreOrderItem;
              numItems: number;
            }[];
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
}
