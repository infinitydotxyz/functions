import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemDifferentWalletConstraint } from './different-wallet-constraint';

describe('different wallet constraint', () => {
  it('only matches for different wallet addresses', () => {
    const addressOne = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
    const addressTwo = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';

    const one = getOrderItem({ makerAddress: addressOne });
    const two = getOrderItem({ makerAddress: addressTwo });
    const constraintOne = new OrderItemDifferentWalletConstraint(one);
    const constraintTwo = new OrderItemDifferentWalletConstraint(two);

    expect(constraintOne.isMatch(constraintTwo.firestoreOrderItem).isValid).toBe(true);
    expect(constraintOne.isMatch(constraintOne.firestoreOrderItem).isValid).toBe(false);
    expect(constraintTwo.isMatch(constraintOne.firestoreOrderItem).isValid).toBe(true);
    expect(constraintTwo.isMatch(constraintTwo.firestoreOrderItem).isValid).toBe(false);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemDifferentWalletConstraint);
    expect(isIncluded).toBe(true);
  });
});
