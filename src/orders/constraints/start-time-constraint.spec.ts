import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemStartTimeConstraint } from './start-time-constraint';

describe('start time constraint', () => {
  it('only matches opposing order items with a start time less than or equal to the end time', () => {
    const now = Date.now();
    const lessThan = getOrderItem({ startTimeMs: now, endTimeMs: now + 500 });
    const equalTo = getOrderItem({ startTimeMs: now + 1000, endTimeMs: now + 2000 });
    const greaterThan = getOrderItem({ startTimeMs: now + 3000, endTimeMs: now + 4000 });

    const constraint = new OrderItemStartTimeConstraint(equalTo);

    expect(constraint.isMatch(lessThan.firestoreOrderItem)).toBe(true);
    expect(constraint.isMatch(equalTo.firestoreOrderItem)).toBe(true);
    expect(constraint.isMatch(greaterThan.firestoreOrderItem)).toBe(false);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some(item => item === OrderItemStartTimeConstraint);
    expect(isIncluded).toBe(true);
  });
});
