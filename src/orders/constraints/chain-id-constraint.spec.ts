import { ChainId } from '@infinityxyz/lib/types/core';
import { OrderItemChainIdConstraint } from './chain-id-constraint';
import { getOrderItem } from './order-item-constraint.spec';

describe('chain id constraint', () => {
  it('only matches for the same chainId', () => {
    const orderItem1Goerli = getOrderItem({ chainId: ChainId.Goerli });
    const orderItem2Mainnet = getOrderItem({ chainId: ChainId.Mainnet });
    const orderItem3Goerli = getOrderItem({ chainId: ChainId.Goerli });
    const constraintGoerli = new OrderItemChainIdConstraint(orderItem3Goerli);
    const constraintMainnet = new OrderItemChainIdConstraint(orderItem2Mainnet);

    expect(constraintGoerli.isMatch(orderItem2Mainnet.firestoreOrderItem)).toBe(false);
    expect(constraintMainnet.isMatch(orderItem1Goerli.firestoreOrderItem)).toBe(false);
    expect(constraintGoerli.isMatch(orderItem3Goerli.firestoreOrderItem)).toBe(true);
    expect(constraintMainnet.isMatch(orderItem3Goerli.firestoreOrderItem)).toBe(false);
  });
});
