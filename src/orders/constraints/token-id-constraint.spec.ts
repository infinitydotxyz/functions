import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemTokenIdConstraint } from './token-id-constraint';

describe('token id constraint', () => {
  it('matches listing with a token id specified to offer for that same token id, or any item in the collection', () => {
    const listing = getOrderItem({ isSellOrder: true, tokenId: '1' });
    const offerForSameTokenId = getOrderItem({ isSellOrder: false, tokenId: '1' });
    const offerForDifferentTokenId = getOrderItem({ isSellOrder: false, tokenId: '2' });
    const offerWithoutTokenIdSpecified = getOrderItem({ isSellOrder: false, tokenId: '' });

    const constraint = new OrderItemTokenIdConstraint(listing);

    expect(constraint.isMatch(offerForSameTokenId.firestoreOrderItem)).toBe(true);
    expect(constraint.isMatch(offerForDifferentTokenId.firestoreOrderItem)).toBe(false);
    expect(constraint.isMatch(offerWithoutTokenIdSpecified.firestoreOrderItem)).toBe(true);
  });

  it('matches offers with a token id specified to listings for that same token id only', () => {
    const offer = getOrderItem({ isSellOrder: false, tokenId: '1' });

    const listingForSameTokenId = getOrderItem({ isSellOrder: false, tokenId: '1' });
    const listingForDifferentTokenId = getOrderItem({ isSellOrder: false, tokenId: '2' });
    const listingWithoutTokenIdSpecified = getOrderItem({ isSellOrder: false, tokenId: '' });

    const constraint = new OrderItemTokenIdConstraint(offer);

    expect(constraint.isMatch(listingForSameTokenId.firestoreOrderItem)).toBe(true);
    expect(constraint.isMatch(listingForDifferentTokenId.firestoreOrderItem)).toBe(false);
    expect(constraint.isMatch(listingWithoutTokenIdSpecified.firestoreOrderItem)).toBe(false);
  });

  it('requires listings to specify a token id', () => {
    const listing = getOrderItem({ isSellOrder: true, tokenId: '' });
    const offerForTokenId = getOrderItem({ isSellOrder: false, tokenId: '1' });
    const offerForCollection = getOrderItem({ isSellOrder: false, tokenId: '' });

    const constraint = new OrderItemTokenIdConstraint(listing);

    expect(constraint.isMatch(offerForTokenId.firestoreOrderItem)).toBe(false);
    expect(constraint.isMatch(offerForCollection.firestoreOrderItem)).toBe(false);
  });

  it('matches offers without a token id specified to any listings', () => {
    const offer = getOrderItem({ isSellOrder: false, tokenId: '' });

    const listingForTokenId = getOrderItem({ isSellOrder: false, tokenId: '1' });
    const listingForCollection = getOrderItem({ isSellOrder: false, tokenId: '' });

    const constraint = new OrderItemTokenIdConstraint(offer);

    expect(constraint.isMatch(listingForTokenId.firestoreOrderItem)).toBe(true);
    expect(constraint.isMatch(listingForCollection.firestoreOrderItem)).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemTokenIdConstraint);
    expect(isIncluded).toBe(true);
  });
});
