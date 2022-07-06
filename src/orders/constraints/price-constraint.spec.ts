import { getOrderItem } from './chain-id-constraint.spec';
import { constraints } from './constraint.types';
import { OrderItemPriceConstraint } from './price-constraint';

describe('price constraint', () => {
  it('matches order items with the same start time, end time, and prices', () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 1, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true });
    const buy = getOrderItem({ ...desc, isSellOrder: false });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(true);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(true);
  });

  it('matches order items where the buy price is greater than the sell price', () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 1, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true });
    const buy = getOrderItem({ ...desc, isSellOrder: false, startPriceEth: 3, endPriceEth: 4 });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(true);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(true);
  });

  it("doesn't matches order items where the sell price is greater than the buy price", () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 1, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true, startPriceEth: 3, endPriceEth: 4 });
    const buy = getOrderItem({ ...desc, isSellOrder: false });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(false);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(false);
  });

  it("doesn't matches order items where the time intervals don't overlap", () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 1, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true });
    const buy = getOrderItem({
      ...desc,
      isSellOrder: false,
      startTimeMs: endTimeMs + 1,
      endTimeMs: endTimeMs + 3_600_000
    });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(false);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(false);
  });

  it('matches order items where the sell order decreases to intersect with the buy order', () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 2, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true, startPriceEth: 4, endPriceEth: 1 });
    const buy = getOrderItem({ ...desc, isSellOrder: false });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(true);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(true);
  });

  it('matches order items where the buy order increases to intersect with the buy order', () => {
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + 3_600_000;
    const desc = { startPriceEth: 2, endPriceEth: 2, startTimeMs, endTimeMs };

    const sell = getOrderItem({ ...desc, isSellOrder: true });
    const buy = getOrderItem({ ...desc, isSellOrder: false, startPriceEth: 1, endPriceEth: 3 });

    const sellConstraint = new OrderItemPriceConstraint(sell);
    const buyConstraint = new OrderItemPriceConstraint(buy);

    expect(sellConstraint.isMatch(buy.firestoreOrderItem).isValid).toBe(true);
    expect(buyConstraint.isMatch(sell.firestoreOrderItem).isValid).toBe(true);
  });

  it('constraint is included', () => {
    const isIncluded = constraints.some((item) => item === OrderItemPriceConstraint);
    expect(isIncluded).toBe(true);
  });
});
