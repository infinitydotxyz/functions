import { Edge } from './edge';
import { EdgeType } from './graph.types';

export class Node<T> {
  private _edges: Set<Edge<T>>;
  private _inputEdges: Set<Edge<T>>;
  private _outputEdges: Set<Edge<T>>;


  public get edges(): Edge<T>[] {
    return [...this._edges];
  }

  public get inputEdges(): Edge<T>[] {
    return [...this._inputEdges];
  }

  public get outputEdges(): Edge<T>[] {
    return [...this._outputEdges];
  }

  constructor() {
    this._edges = new Set();
    this._inputEdges = new Set();
    this._outputEdges = new Set();
  }

  unlink() {
    for(const edge of this._edges) {
        edge.unlink();
    }
  }

  add(edge: Edge<T>, type: EdgeType) {
    this._edges.add(edge);
    if(type === EdgeType.Input) {
        this._inputEdges.add(edge);
    } else {
        this._outputEdges.add(edge);
    }
  }

  remove(edge: Edge<T>) {
    this._edges.delete(edge);
  }
}
