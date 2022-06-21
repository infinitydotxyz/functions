import { Edge } from './edge';

export class Path<T> {
  private _edges: Set<Edge<T>>;

  constructor() {
    this._edges = new Set();
  }

  public get length() {
    return this._edges.size;
  }

  public get weight(): number {
    let sum = 0;
    this._edges.forEach((edge) => (sum += edge.weight));
    return sum;
  }

  public get start() {
    return [...this._edges][0];
  }

  public get end() {
    const edges = [...this._edges];
    return edges[edges.length - 1];
  }

  add(edge: Edge<T>) {
    this._edges.add(edge);
  }
}
