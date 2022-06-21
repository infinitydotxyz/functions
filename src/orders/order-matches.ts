import { getOneToManyOrderIntersection } from '../utils/intersection';
import { Order } from './order';
import { OrderItem as IOrderItem } from './orders.types';

export class OrderMatches {
  public get numItems() {
    return this.order.firestoreOrder.numItems;
  }

  private orderItemMatches: Map<IOrderItem, IOrderItem[][]>;

  constructor(public readonly order: Order, private readonly orderItems: IOrderItem[]) {
    for (const orderItem of orderItems) {
      this.orderItemMatches.set(orderItem, []);
    }
  }

  checkMatch(matches: { orderItem: IOrderItem; opposingOrderItems: IOrderItem[] }[]) {
    let numItems = 0;
    const uniqueOrders = new Map<string, IOrderItem>();
    for (const match of matches) {
      const result = match.orderItem.areMatches(match.opposingOrderItems);
      if (!result.isValid) {
        return { isValid: false };
      }
      numItems += result.numItems;
      for (const opposingOrderItem of match.opposingOrderItems) {
        const orderId = opposingOrderItem.firestoreOrderItem.id;
        uniqueOrders.set(orderId, opposingOrderItem);
      }
    }

    const priceIntersection = getOneToManyOrderIntersection(
      this.order.firestoreOrder,
      [...uniqueOrders.values()].map((orderItem) => orderItem.firestoreOrderItem)
    );

    const numItemsMatches = numItems === this.order.firestoreOrder.numItems;

    if (!numItemsMatches || !priceIntersection) {
      return {
        isValid: false
      };
    }

    const validAfter = priceIntersection.timestamp;
    const isFutureMatch = validAfter > Date.now();

    if (isFutureMatch) {
      return {
        isValid: true,
        price: priceIntersection.price,
        timestamp: priceIntersection.timestamp
      };
    }

    const now = Date.now();
    const currentPrice = priceIntersection.getPriceAtTime(now);
    if (currentPrice === null) {
      return {
        isValid: false
      };
    }

    return {
      isValid: true,
      timestamp: now,
      price: currentPrice
    };
  }
}
