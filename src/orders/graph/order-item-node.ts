
import { OrderItem } from "../orders.types";
import { Node } from "./node";


export class OrderItemNode extends Node<OrderItem> {
    protected data: OrderItem;
    edges: OrderItemNode[];

    constructor(orderItem: OrderItem) {
        super();
        this.data = orderItem;
        this.edges = [];
    }



    
}   