import { Order } from "../orders/order";
import { NodeCollection } from "./node-collection";
import { OrderItem as IOrderItem } from '../orders/orders.types';
import { Node } from './node';

interface Data {
    order: Order;
    orderItems: IOrderItem[];
}

export class OrderNodeCollection extends NodeCollection<Data, IOrderItem> {
    constructor(order: Order, orderItems: IOrderItem[]) {
        super({
            order,
            orderItems
        });
        this.initNodes();
    }

    private initNodes() {
        for(const orderItem of this.data.orderItems) {
            const node = new Node(orderItem);
            this.add(node);
        }
    }
}