import { Edge } from './edge';
import { Node } from './node';

export class NodeCollection<Data, InternalNodeData> {
  protected nodes: Set<Node<InternalNodeData>>;

  constructor(public data: Data) {
    this.nodes = new Set();
  }

  public get edges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.edges];
    }
    return edges;
  }

  public get inputEdges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.inputEdges];
    }
    return edges;
  }

  public get outputEdges(): Edge<InternalNodeData>[] {
    let edges: Edge<InternalNodeData>[] = [];
    for (const node of this.nodes) {
      edges = [...edges, ...node.outputEdges];
    }
    return edges;
  }

  public get inputEdgeWeight(): number {
    let sum = 0;
    for (const node of this.nodes) {
      sum += node.inputEdgeWeight;
    }
    return sum;
  }

  public get outputEdgeWeight(): number {
    let sum = 0;
    for (const node of this.nodes) {
      sum += node.outputEdgeWeight;
    }
    return sum;
  }

  unlink() {
    for (const node of this.nodes) {
      node.unlink();
    }
  }
}
