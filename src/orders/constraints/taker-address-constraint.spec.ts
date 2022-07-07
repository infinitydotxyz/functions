import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemTakerAddressConstraint } from './taker-address-constraint';

describe('taker address constraint', () => {
  it('only matches opposing order items where the maker address is equal to the specified taker address', () => {
    const addressOne = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
    const addressTwo = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';

    const orderForAddressTwo = getOrderItem({ isSellOrder: true, makerAddress: addressOne, takerAddress: addressTwo });

    const orderByAddressOne = getOrderItem({ makerAddress: addressOne });
    const orderByAddressTwo = getOrderItem({ makerAddress: addressTwo });

    const orderForAddressTwoConstraint = new OrderItemTakerAddressConstraint(orderForAddressTwo);

    expect(orderForAddressTwoConstraint.isMatch(orderByAddressOne.firestoreOrderItem).isValid).toBe(false);
    expect(orderForAddressTwoConstraint.isMatch(orderByAddressTwo.firestoreOrderItem).isValid).toBe(true);
  });

  it('matches opposing order items when the taker address is not specified', () => {
    const addressOne = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
    const addressTwo = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';

    const orderForAddressTwo = getOrderItem({ isSellOrder: true, makerAddress: addressOne, takerAddress: '' });

    const orderByAddressOne = getOrderItem({ makerAddress: addressOne });
    const orderByAddressTwo = getOrderItem({ makerAddress: addressTwo });

    const orderForAddressTwoConstraint = new OrderItemTakerAddressConstraint(orderForAddressTwo);

    expect(orderForAddressTwoConstraint.isMatch(orderByAddressOne.firestoreOrderItem).isValid).toBe(true);
    expect(orderForAddressTwoConstraint.isMatch(orderByAddressTwo.firestoreOrderItem).isValid).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemTakerAddressConstraint);
    expect(isIncluded).toBe(true);
  });
});
