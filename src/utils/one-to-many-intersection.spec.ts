import { OrderItemPrice } from '../orders/orders.types';
import { getOneToManyOrderIntersection } from './intersection';
import { testOrderIntersection } from './intersection.spec';

const OFFER = false;
const LISTING = true;

describe('one to many intersection reduces to intersection', () => {
  const oneToOneToOneToMany = (one: OrderItemPrice, two: OrderItemPrice) => {
    return getOneToManyOrderIntersection(one, [two]);
  };
  testOrderIntersection(oneToOneToOneToMany);
});

describe('one to many intersection', () => {
  it('Many order prices sum to less than single order offer', () => {
    const orderOne = {
      isSellOrder: OFFER,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 0.1,
      endPriceEth: 0.1
    };

    const many = [orderTwo, orderTwo];
    const sum = many.reduce((acc, curr) => acc + curr.startPriceEth, 0);

    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection?.timestamp).toBe(orderOne.startTimeMs);
    expect(intersection?.price).toBe(sum);
    expect(intersection?.getPriceAtTime(orderTwo.endTimeMs)).toBe(sum);
  });

  it('Many order prices sum to be single order offer', () => {
    const orderOne = {
      isSellOrder: OFFER,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 0.5,
      endPriceEth: 0.5
    };

    const many = [orderTwo, orderTwo];
    const sum = many.reduce((acc, curr) => acc + curr.startPriceEth, 0);

    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection?.timestamp).toBe(orderOne.startTimeMs);
    expect(intersection?.price).toBe(sum);
    expect(intersection?.getPriceAtTime(orderTwo.endTimeMs)).toBe(sum);
  });

  it('Many order prices sum to be more than single order offer', () => {
    const orderOne = {
      isSellOrder: OFFER,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const many = [orderTwo, orderTwo];
    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection).toBe(null);
  });

  it('Many order prices sum to be less than single order listing', () => {
    const orderOne = {
      isSellOrder: LISTING,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 0.1,
      endPriceEth: 0.1
    };

    const many = [orderTwo, orderTwo];

    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection).toBe(null);
  });

  it('Many order prices sum to be price of single order listing', () => {
    const orderOne = {
      isSellOrder: LISTING,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 0.5,
      endPriceEth: 0.5
    };

    const many = [orderTwo, orderTwo];

    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection?.price).toBe(orderOne.startPriceEth);
    expect(intersection?.timestamp).toBe(orderOne.startTimeMs);
    expect(intersection?.getPriceAtTime(orderTwo.endTimeMs)).toBe(orderOne.endPriceEth);
  });

  it('Many order prices sum to be more than the price of single order listing', () => {
    const orderOne = {
      isSellOrder: LISTING,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const many = [orderTwo, orderTwo];

    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection?.price).toBe(orderOne.startPriceEth);
    expect(intersection?.timestamp).toBe(orderOne.startTimeMs);
    expect(intersection?.getPriceAtTime(orderTwo.endTimeMs)).toBe(orderOne.endPriceEth);
  });

  it("Many order timestamps don't overlap", () => {
    const orderOne = {
      isSellOrder: LISTING,
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderTwo = {
      isSellOrder: !orderOne.isSellOrder,
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 1,
      endPriceEth: 1
    };

    const orderThree = {
        ...orderTwo,
        startTimeMs: orderOne.endTimeMs + 1,
        endTimeMs: orderOne.endTimeMs + 2
    }
    const many = [orderTwo, orderThree];
    const intersection = getOneToManyOrderIntersection(orderOne, many);

    expect(intersection).toBe(null);
  });
});
