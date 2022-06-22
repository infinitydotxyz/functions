import { EdgeType } from './graph.types';
import { Node } from './node';

export class Edge<T> {
  public incomingNode?: Node<T>;
  public outgoingNode?: Node<T>;
  
  constructor(public flow = 0) {}

  public get maxFlow() {
    return Math.min(this.incomingNode?.maxFlow ?? 0, this.outgoingNode?.maxFlow ?? 0);
  }

  link(incomingNode: Node<T>, outputNode: Node<T>) {
    this.unlink();

    this.incomingNode = incomingNode;
    this.outgoingNode = outputNode;

    this.incomingNode.add(this, EdgeType.Incoming);
    this.outgoingNode.add(this, EdgeType.Outgoing);
  }

  unlink() {
    if (this.incomingNode) {
      this.incomingNode.remove(this);
    }

    if (this.outgoingNode) {
      this.outgoingNode.remove(this);
    }

    this.incomingNode = undefined;
    this.outgoingNode = undefined;
  }

  pushFlow(flow: number) {
    if(flow > this.maxFlow) {
      throw new Error('Flow exceeds max flow');
    }

  }
}
