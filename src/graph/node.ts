import { Edge } from './edge';
import { EdgeType } from './graph.types';
import { Node as INode } from './graph.types';
export class Node<T> implements INode<T> {
  private _edges: Set<Edge<T>>;
  private _incomingEdges: Set<Edge<T>>;
  private _outgoingEdges: Set<Edge<T>>;

  public get edges(): Edge<T>[] {
    return [...this._edges];
  }

  public get incomingEdges(): Edge<T>[] {
    return [...this._incomingEdges];
  }

  public get outgoingEdges(): Edge<T>[] {
    return [...this._outgoingEdges];
  }

  public get outgoingEdgesWithNonZeroFlow(): Edge<T>[] {
    return this.outgoingEdges.filter((edge) => edge.flow > 0);
  }

  public get incomingEdgesWithNonZeroFlow(): Edge<T>[] {
    return this.incomingEdges.filter((edge) => edge.flow > 0);
  }

  get incomingEdgeFlow(): number {
    let sum = 0;
    for (const edge of this.incomingEdges) {
      sum += edge.flow;
    }
    return sum;
  }

  get outgoingEdgeFlow(): number {
    let sum = 0;
    for (const edge of this.outgoingEdges) {
      sum += edge.flow;
    }
    return sum;
  }

  constructor(public data: T, public maxFlow: number) {
    this._edges = new Set();
    this._incomingEdges = new Set();
    this._outgoingEdges = new Set();
  }

  unlink() {
    for (const edge of this._edges) {
      edge.unlink();
    }
  }

  add(edge: Edge<T>, type: EdgeType) {
    this._edges.add(edge);
    if (type === EdgeType.Incoming) {
      this._incomingEdges.add(edge);
    } else {
      this._outgoingEdges.add(edge);
    }
  }

  remove(edge: Edge<T>) {
    this._edges.delete(edge);
    this._outgoingEdges.delete(edge);
    this._incomingEdges.delete(edge);
  }

  pushFlow(flow: number): { flowPushed: number } {
    const currentFlow = this.outgoingEdgeFlow;
    flow = Math.min(flow, this.maxFlow - currentFlow);
    let flowPushed = 0;

    for (const edge of this.outgoingEdges) {
      if (flow <= 0) {
        break;
      }

      const maxFlowToPushToEdge = edge.maxFlow - edge.flow;
      if (maxFlowToPushToEdge > 0) {
        const flowToPushToEdge = Math.min(maxFlowToPushToEdge, flow);
        edge.flow = flowToPushToEdge;
        flow -= flowToPushToEdge;
        flowPushed += flowToPushToEdge;
      }
    }

    return { flowPushed };
  }
}
