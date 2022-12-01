import { Order } from '../../orders/order';
import { OrderItem as IOrderItem, OrderItemMatch } from '../../orders/orders.types';

export type OneToOneMatch = {
  order: Order;
  orderItems: IOrderItem[];
  opposingOrder: Order;
  opposingOrderItems: IOrderItem[];
  matches: OrderItemMatch[];
  price: number;
  timestamp: number;
};
