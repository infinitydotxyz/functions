import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemNumTokensConstraint } from './num-tokens-constraint';

describe('num tokens constraint', () => {
  it('only matches order items with the same number of order items', () => {
    const one = getOrderItem({ numTokens: 1 });
    const two = getOrderItem({ numTokens: 2 });
    const three = getOrderItem({ numTokens: 3 });

    const constraintTwo = new OrderItemNumTokensConstraint(two);

    expect(constraintTwo.isMatch(one.firestoreOrderItem).isValid).toBe(false);
    expect(constraintTwo.isMatch(two.firestoreOrderItem).isValid).toBe(true);
    expect(constraintTwo.isMatch(three.firestoreOrderItem).isValid).toBe(false);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemNumTokensConstraint);
    expect(isIncluded).toBe(true);
  });
});
