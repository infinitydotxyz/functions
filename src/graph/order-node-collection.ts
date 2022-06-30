import { Order } from '../orders/order';
import { NodeCollection } from './node-collection';
import { OrderItem as IOrderItem } from '../orders/orders.types';
import { Node } from './node';

interface Data {
  order: Order;
  orderItems: IOrderItem[];
}

export interface OrderItemNodeData {
  orderItem: IOrderItem;
  orderNode: OrderNodeCollection;
}

export class OrderNodeCollection extends NodeCollection<Data, OrderItemNodeData> {
  constructor(order: Order, orderItems: IOrderItem[]) {
    super(
      {
        order,
        orderItems
      },
      order.firestoreOrder.numItems
    );
    this.initNodes();
  }

  private initNodes() {
    for (const orderItem of this.data.orderItems) {
      const orderItemMaxFlow = orderItem.maxNumItemsContribution;
      const node = new Node({ orderItem, orderNode: this }, orderItemMaxFlow);
      this.add(node);
    }
  }
}
