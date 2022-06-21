import { Edge } from './edge';

export enum EdgeType {
  Input,
  Output
}

export interface Node<T> {
  edges: Edge<T>[];

  inputEdges: Edge<T>[];

  outputEdges: Edge<T>[];

  inputEdgeWeight: number;

  outputEdgeWeight: number;

  unlink(): void;

  add(edge: Edge<T>, type: EdgeType): void;

  remove(edge: Edge<T>): void;
}
