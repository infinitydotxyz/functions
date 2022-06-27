import { EdgeType } from './graph.types';
import { Node } from './node';

export class Edge<T> {
  public fromNode?: Node<T>;
  public toNode?: Node<T>;

  constructor(public flow = 0) {}

  public get maxFlow() {
    return Math.min(this.fromNode?.maxFlow ?? 0, this.toNode?.maxFlow ?? 0);
  }

  link(from: Node<T>, to: Node<T>) {
    this.unlink();

    this.fromNode = from;
    this.toNode = to;

    this.fromNode.add(this, EdgeType.Outgoing);
    this.toNode.add(this, EdgeType.Incoming);
  }

  unlink() {
    if (this.fromNode) {
      this.fromNode.remove(this);
    }

    if (this.toNode) {
      this.toNode.remove(this);
    }

    this.fromNode = undefined;
    this.toNode = undefined;
  }

  pushFlow(flow: number) {
    if (flow > this.maxFlow) {
      throw new Error('Flow exceeds max flow');
    }
  }
}
