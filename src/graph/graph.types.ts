import { Edge } from './edge';

export enum EdgeType {
  Incoming,
  Outgoing
}

export interface Node<T> {
  edges: Edge<T>[];

  incomingEdges: Edge<T>[];

  outgoingEdges: Edge<T>[];

  incomingEdgeFlow: number;

  outgoingEdgeFlow: number;

  maxFlow: number;

  unlink(): void;

  add(edge: Edge<T>, type: EdgeType): void;

  remove(edge: Edge<T>): void;
}

