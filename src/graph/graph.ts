import { Node } from './node';
import { Edge } from './edge';

export class Graph<T> {
  protected nodes: Node<T>[];

  protected edges: Edge<T>[];

  constructor(protected root: Node<T>) {}
}
