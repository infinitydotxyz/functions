import { EdgeType } from './graph.types';
import { Node } from './node';

export class Edge<T> {
  public inputNode?: Node<T>;
  public outputNode?: Node<T>;

  public weight: number;

  constructor() {
    this.weight = 0;
  }

  link(inputNode: Node<T>, outputNode: Node<T>) {
    this.unlink();

    this.inputNode = inputNode;
    this.outputNode = outputNode;

    this.inputNode.add(this, EdgeType.Input);
    this.outputNode.add(this, EdgeType.Output);
  }
 
  unlink() {
    if(this.inputNode) {
        this.inputNode.remove(this);
    }

    if(this.outputNode) {
        this.outputNode.remove(this);
    }

    this.inputNode = undefined; 
    this.outputNode = undefined;
  }
}
