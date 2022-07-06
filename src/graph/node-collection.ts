import { Edge } from './edge';
import { Node } from './node';

export class NodeCollection<Data, InternalNodeData> {
  protected _nodes: Set<Node<InternalNodeData>>;

  constructor(public data: Data, public readonly maxFlow: number) {
    this._nodes = new Set();
  }

  public get nodes() {
    return this._nodes;
  }

  public get edges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.edges];
    }
    return edges;
  }

  public get incomingEdges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.incomingEdges];
    }
    return edges;
  }

  public get outgoingEdges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.outgoingEdges];
    }
    return edges;
  }

  public get incomingEdgeFlow(): number {
    let sum = 0;
    for (const node of this.nodes) {
      sum += node.incomingEdgeFlow;
    }
    return sum;
  }

  public get outgoingEdgeFlow(): number {
    let sum = 0;
    for (const node of this.nodes) {
      sum += node.outgoingEdgeFlow;
    }
    return sum;
  }

  public get outgoingEdgesWithNonZeroFlow(): Edge<InternalNodeData>[] {
    return [...this.nodes].flatMap((node) => node.outgoingEdgesWithNonZeroFlow);
  }

  public get incomingEdgesWithNonZeroFlow(): Edge<InternalNodeData>[] {
    return [...this.nodes].flatMap((node) => node.incomingEdgesWithNonZeroFlow);
  }

  unlink() {
    for (const node of this.nodes) {
      node.unlink();
    }
  }

  add(node: Node<InternalNodeData>) {
    this.nodes.add(node);
  }

  remove(node: Node<InternalNodeData>) {
    this.nodes.delete(node);
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

    while (this.nodes.size > 0) {
      let flowPushedInIteration = 0;
      for (const node of this.nodes) {
        const totalFlow = this.outgoingEdgeFlow;
        const flowRemaining = this.maxFlow - totalFlow;
        const { flowPushed: flowPushedToNode } = node.pushFlow(flowRemaining);
        console.log(`Attempted to push ${flowRemaining} to node. Successfully pushed ${flowPushedToNode}`);
        totalFlowPushed += flowPushedToNode;
        flowPushedInIteration += flowPushedToNode;
      }
      yield { flowPushed: flowPushedInIteration, totalFlowPushed };
    }
  }
}
