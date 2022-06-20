import { Order } from "../order";
import { OrderItem } from "../orders.types";
import { Node } from "./node";
import { OrderItemNode } from "./order-item-node";


export class OrderNode extends Node<Order> {
    protected data: Order;
    protected orderItems: OrderItem[];

    protected orderItemNodes: OrderItemNode[];

    constructor(order: Order, orderItems: OrderItem[]) {
        super();
        this.data = order;
        this.orderItems = orderItems;
        for(const orderItem of this.orderItems) {
            const node = new OrderItemNode(orderItem);
            this.orderItemNodes.push(node);
        }
    }
}