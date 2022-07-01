import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemEndTimeConstraint } from './end-time-constraint';

describe('end time constraint', () => {
  it('only matches when start time is greater than or equal to opposing end time', () => {
    const startTime = Date.now();
    const endTimeLessThanStartTime = startTime - 1;
    const endTimeEqualsStartTime = startTime;
    const endTimeGreaterThanStartTime = startTime + 1;

    const main = getOrderItem({ startTimeMs: startTime, endTimeMs: startTime + 100 });
    const lessThan = getOrderItem({ startTimeMs: startTime, endTimeMs: endTimeLessThanStartTime });
    const equalTo = getOrderItem({ startTimeMs: startTime, endTimeMs: endTimeEqualsStartTime });
    const greaterThan = getOrderItem({ startTimeMs: startTime, endTimeMs: endTimeGreaterThanStartTime });


    const constraintOne = new OrderItemEndTimeConstraint(main);

    expect(constraintOne.isMatch(lessThan.firestoreOrderItem)).toBe(false);
    expect(constraintOne.isMatch(equalTo.firestoreOrderItem)).toBe(true);
    expect(constraintOne.isMatch(greaterThan.firestoreOrderItem)).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some(item => item === OrderItemEndTimeConstraint);
    expect(isIncluded).toBe(true);
  });
});
