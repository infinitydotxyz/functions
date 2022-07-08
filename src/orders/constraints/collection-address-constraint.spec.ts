import { getOrderItem } from './chain-id-constraint.spec';
import { OrderItemCollectionAddressConstraint } from './collection-address-constraint';
import { constraints } from './constraint.types';

describe('collection address constraint', () => {
  it('only matches for the same collection address', () => {
    const goerliDoodlesAddress = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
    const doodlesAddress = '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e';

    const goerliDoodles1 = getOrderItem({ collectionAddress: goerliDoodlesAddress });
    const doodles = getOrderItem({ collectionAddress: doodlesAddress });
    const constraintGoerliDoodles = new OrderItemCollectionAddressConstraint(goerliDoodles1);
    const constraintDoodles = new OrderItemCollectionAddressConstraint(doodles);

    expect(constraintGoerliDoodles.isMatch(doodles.firestoreOrderItem).isValid).toBe(false);
    expect(constraintGoerliDoodles.isMatch(goerliDoodles1.firestoreOrderItem).isValid).toBe(true);
    expect(constraintDoodles.isMatch(goerliDoodles1.firestoreOrderItem).isValid).toBe(false);
    expect(constraintDoodles.isMatch(constraintDoodles.firestoreOrderItem).isValid).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemCollectionAddressConstraint);
    expect(isIncluded).toBe(true);
  });
});
