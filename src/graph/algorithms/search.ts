import { Edge } from "../edge";
import { OrderItemNodeData, OrderNodeCollection } from "../order-node-collection";
import { Node } from "../node";

export type Path<T> = { edges: { edge: Edge<T>, weight: number }[] };
export type Paths<T> = Path<T>[];

export class OneToManyOrderMatchSearch {
    constructor(private graph: OrderNodeCollection) {}

    public searchForMatches()  {
        const orderItems = this.graph.nodes;
        this.pushFlowFromOrderItemNodes(orderItems);
        
    }



    private pushFlowFromOrderItemNodes(nodes: Set<Node<OrderItemNodeData>>) {
        for(const node of nodes) {
            node.pushFlow(node.maxFlow);
        }
    }
}