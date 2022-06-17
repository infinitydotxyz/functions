import { Order } from './order';
import { OrderItem as IOrderItem } from './orders.types';

interface OrderItemMatch {
  orderItem: IOrderItem;
  orderItemMatches: IOrderItem[];
  numItemsInMatch: number;
}

export class OrderMatch {
  public get numItems() {
    return this.order.firestoreOrder.numItems;
  }

  private orderItemMatches: Map<IOrderItem, IOrderItem[][]>;

  constructor(public readonly order: Order, private readonly orderItems: IOrderItem[]) {
    for (const orderItem of orderItems) {
      this.orderItemMatches.set(orderItem, []);
    }
  }

  checkMatch(matches: { orderItem: IOrderItem, opposingOrderItems: IOrderItem[] }[]) {
      for(const match of matches) {
          const result = match.orderItem.areMatches(match.opposingOrderItems);
          if(!result.isValid) {
              return { isValid: false };
          }

      }

  }
}
