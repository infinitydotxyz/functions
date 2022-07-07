import { EdgeType } from './graph.types';
import { Node } from './node';

export class Edge<T> {
  public fromNode?: Node<T>;
  public toNode?: Node<T>;

  public get flow() {
    return this._flow;
  }

  constructor(protected _flow = 0) {}

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
    this._flow = 0;
  }

  pushFlow(flow: number) {
    if (!this.toNode) {
      return { flowPushed: 0 };
    }
    const { flowPushed } = this.toNode.pushFlow(flow);
    this._flow = this._flow + flowPushed;

    return { flowPushed };
  }
}
