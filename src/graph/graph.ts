import { Node } from './node';
import { Edge } from './edge';

export class Graph<T> {
  protected nodes: Node<T>[];

  protected edges: Edge<T>[];

  constructor(protected root: Node<T>) {}

  add(edge: Edge<T>) {
    this.edges.push(edge);
    if (edge.inputNode) {
      this.nodes.push(edge.inputNode);
    }
    if (edge.outputNode) {
      this.nodes.push(edge.outputNode);
    }
  }
}
