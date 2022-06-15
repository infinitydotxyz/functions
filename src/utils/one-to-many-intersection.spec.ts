import { OrderItemPrice } from '../orders/orders.types';
import { getOneToManyOrderIntersection } from './intersection';
import { testOrderIntersection } from './intersection.spec';

describe('reduces to intersection', () => {
    const oneToOneToOneToMany = (one: OrderItemPrice, two: OrderItemPrice) => {
        return getOneToManyOrderIntersection(one, [two]);
    }
    testOrderIntersection(oneToOneToOneToMany);
});
