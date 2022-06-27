import { Edge } from './edge';
import { Node } from './node';

export class NodeCollection<Data, InternalNodeData> {
  protected _nodes: Set<Node<InternalNodeData>>;

  constructor(public data: Data) {
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
}
