

import { OBOrderStatus } from '@infinityxyz/lib/types/core';
import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemOrderStatusConstraint } from './order-status-constraint';

describe('order status constraint', () => {
  it('only matches order items that are valid active', () => {
    const validActive = getOrderItem({ orderStatus: OBOrderStatus.ValidActive });
    const validInactive = getOrderItem({ orderStatus: OBOrderStatus.ValidInactive });
    const invalid = getOrderItem({ orderStatus: OBOrderStatus.Invalid });

    const validActiveConstraint = new OrderItemOrderStatusConstraint(validActive);

    expect(validActiveConstraint.isMatch(validInactive.firestoreOrderItem)).toBe(false);
    expect(validActiveConstraint.isMatch(validActive.firestoreOrderItem)).toBe(true);
    expect(validActiveConstraint.isMatch(invalid.firestoreOrderItem)).toBe(false);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some(item => item === OrderItemOrderStatusConstraint);
    expect(isIncluded).toBe(true);
  });
});
