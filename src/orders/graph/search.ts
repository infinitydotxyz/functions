import { Order } from "../order";
import { OrderItem } from "../order-item";
import { OrderNode } from "./order-node";

export async function search(order: Order, orderItems: OrderItem[], possibleMatchingOrders: Order[]) {
    const orderNode = new OrderNode(order, orderItems);
    const matchingOrderNodes = possibleMatchingOrders.map(async (item) => {
        const orderItems = await item.getOrderItems();
        return new OrderNode(order, orderItems);
    });





}

async function buildGraph(source: OrderNode, )