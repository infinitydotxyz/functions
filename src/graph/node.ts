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

  public get flow(): number {
    if (this.isSink) {
      return this._flow;
    }
    return this.outgoingEdgeFlow;
  }

  private _flow: number;
  constructor(public data: T, public maxFlow: number, public readonly isSink = false) {
    this._edges = new Set();
    this._incomingEdges = new Set();
    this._outgoingEdges = new Set();
    this._flow = 0;
  }

  unlink() {
    for (const edge of this.edges) {
      edge.unlink();
    }
  }

  add(edge: Edge<T>, type: EdgeType) {
    if (type === EdgeType.Incoming) {
      this._incomingEdges.add(edge);
    } else {
      if (this.isSink) {
        throw new Error('Cannot add outgoing edge to sink node');
      }
      this._outgoingEdges.add(edge);
    }
    this._edges.add(edge);
  }

  remove(edge: Edge<T>) {
    // TODO what happens to the flow if an edge with flow is removed?
    if (this.isSink && this._incomingEdges.has(edge)) {
      this._flow -= edge.flow;
    }
    this._edges.delete(edge);
    this._outgoingEdges.delete(edge);
    this._incomingEdges.delete(edge);
  }

  pushFlow(flow: number): { flowPushed: number } {
    if (this.isSink) {
      console.log(`Pushing flow to sink node. Max flow: ${this.maxFlow} Current Flow: ${this._flow}`);
      const flowRemaining = this.maxFlow - this._flow;
      const flowPushed = Math.min(flowRemaining, flow);
      this._flow = this._flow + flowPushed;
      return { flowPushed };
    }

    const currentFlow = this.outgoingEdgeFlow;
    console.log(`Pushing flow to node. Max flow: ${this.maxFlow} Current Flow: ${currentFlow}. Outgoing edges: ${this.outgoingEdges.length}`);
    flow = Math.min(flow, this.maxFlow - currentFlow); 
    let flowPushed = 0;

    for (const edge of this.outgoingEdges) {
      if (flow <= 0) {
        break;
      }

      const { flowPushed: flowPushedOnEdge } = edge.pushFlow(flow);
      flow -= flowPushedOnEdge;
      flowPushed += flowPushedOnEdge;
    }

    return { flowPushed };
  }
}
