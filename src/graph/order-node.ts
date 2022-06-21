import { Order } from "../orders/order";
import { OrderItem } from "../orders/order-item";
import { Node } from "./node";


export interface OrderNodeData {
    order: Order;
    orderItemNodes: Node<OrderItem>;
}

