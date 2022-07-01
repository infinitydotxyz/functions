import { getOrderItem } from './chain-id-constraint.spec';
import { OrderItemComplicationAddressConstraint } from './complication-address-constraint';
import { constraints } from './constraint.types';

describe('complication address constraint', () => {
  it('only matches for the same complication address', () => {
    const complicationOne = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
    const complicationTwo = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';

    const one = getOrderItem({ complicationAddress: complicationOne });
    const two = getOrderItem({ complicationAddress: complicationTwo });
    const constraintOne = new OrderItemComplicationAddressConstraint(one);
    const constraintTwo = new OrderItemComplicationAddressConstraint(two);

    expect(constraintOne.isMatch(constraintTwo.firestoreOrderItem)).toBe(false);
    expect(constraintOne.isMatch(constraintOne.firestoreOrderItem)).toBe(true);
    expect(constraintTwo.isMatch(constraintOne.firestoreOrderItem)).toBe(false);
    expect(constraintTwo.isMatch(constraintTwo.firestoreOrderItem)).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemComplicationAddressConstraint);
    expect(isIncluded).toBe(true);
  });
});
