import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemOrderSideConstraint } from './order-side-constraint';

describe('order side constraint', () => {
  it('only matches order items of the opposite order side', () => {
    const buy = getOrderItem({ isSellOrder: false });
    const sell = getOrderItem({ isSellOrder: true });

    const constraintBuy = new OrderItemOrderSideConstraint(buy);
    const constraintSell = new OrderItemOrderSideConstraint(sell);

    expect(constraintBuy.isMatch(sell.firestoreOrderItem)).toBe(true);
    expect(constraintBuy.isMatch(buy.firestoreOrderItem)).toBe(false);
    expect(constraintSell.isMatch(buy.firestoreOrderItem)).toBe(true);
    expect(constraintSell.isMatch(sell.firestoreOrderItem)).toBe(false);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemOrderSideConstraint);
    expect(isIncluded).toBe(true);
  });
});