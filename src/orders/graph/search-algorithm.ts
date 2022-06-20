import { Order } from "../order";
import { Node } from "./node";

export class OneToManySearchAlgorithm<T> {
    constructor(private one: Node<T>, private many: Node<T>[]) {}

    
}