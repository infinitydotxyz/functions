import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core';

import { getOneToManyOrderIntersection } from '../../../utils/intersection';
import { OrderNodeCollection } from '../../graph/order-node-collection';
import { OrderMatchSearch } from '../order-match-search.abstract';
import { OneToManyMatch } from './types';

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
      const graph = this.connectNodes(this.rootOrderNode, matchingOrderNodes);
      this.log?.(
        `Searching for matches in graph containing ${matchingOrderNodes.length} opposing orders and ${graph.outgoingEdges.length} opposing order items`
      );
      const mainOpposingOrderNode = matchingOrderNodes.shift();
      const flowPusher = graph.streamFlow();
      for (const { flowPushed, totalFlowPushed } of flowPusher) {
        this.log?.(`  Pushed ${flowPushed} flow. Total: ${totalFlowPushed}`);
        if (flowPushed === 0) {
          this.log?.(
            `    Reached stable state where flow can no longer be pushed. Current num matches being considered ${matchingOrderNodes.length}`
          );
          break;
        }

        const edgesWithFlow = this.getEdgesWithNonZeroFlow(graph);
        const orderNodesWithFlow = this.getOrdersNodesFromEdges(edgesWithFlow);
        this.log?.(
          `    Search resulted in ${edgesWithFlow.length} edges with non-zero flow including ${orderNodesWithFlow.size} unique orders`
        );
        const sortedOrderNodesWithFlow = [...orderNodesWithFlow].sort(
          (a, b) => a.data.order.firestoreOrder.startTimeMs - b.data.order.firestoreOrder.startTimeMs
        );
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
            this.log?.(`    Found match with orders but the combined intersection was invalid`);
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
            this.log?.(
              `    * Found valid match containing ${res.firestoreOrders.length} opposing orders and ${
                edges.length
              } order items. Valid at ${new Date(intersection.timestamp)} for price ${intersection.price} *`
            );
            yield {
              firestoreOrder: graph.data.order.firestoreOrder,
              opposingFirestoreOrders: res.firestoreOrders,
              intersection,
              edges
            };
          }
        } else {
          if (!res.isValid) {
            this.log?.(`    Flow not valid for current matching combinations`);
          } else if (res.flow !== graph.data.order.firestoreOrder.numItems) {
            this.log?.(
              `    Flow not valid for root order. Flow is ${res.flow} but expected ${graph.data.order.firestoreOrder.numItems}`
            );
          }
          res.invalidOrderNodes[0]?.unlink();
        }
      }
    }
  }
}
