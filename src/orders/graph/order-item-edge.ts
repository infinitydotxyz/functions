import { OrderItemNode } from "./order-item-node";


export class OrderItemEdge {
    constructor(protected _from: OrderItemNode, protected _to: OrderItemNode) {
        
    }
}