import { getOrderIntersection } from "./intersection";

describe("intersection", () => {
  it("should be defined", () => {
    expect(getOrderIntersection).toBeDefined();
  });

  it("should return null if timestamps don't overlap", () => {
    const orderOnePrice = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };

    const orderTwoPrice = {
      startTimeMs: 300_000,
      endTimeMs: 400_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };

    const intersection = getOrderIntersection(orderOnePrice, orderTwoPrice);
    expect(intersection).toBeNull();
  });

  it("should return null if prices don't overlap", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };

    const orderTwo = {
      startTimeMs: orderOne.startTimeMs,
      endTimeMs: orderOne.endTimeMs,
      startPriceEth: 3,
      endPriceEth: 4,
    };

    const intersection = getOrderIntersection(orderOne, orderTwo);
    expect(intersection).toBeNull();
  });

  it("should handle lines the barely overlap", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };

    const orderTwo = {
      startTimeMs: orderOne.endTimeMs,
      endTimeMs: orderOne.endTimeMs + 100_000,
      startPriceEth: orderOne.endPriceEth,
      endPriceEth: orderOne.startPriceEth,
    };

    const intersection = getOrderIntersection(orderOne, orderTwo);
    expect(intersection).not.toBeNull();
    if (intersection == null) {
      expect(intersection).toBeTruthy();
      return;
    }
    expect(intersection.price).toEqual(orderOne.endPriceEth);
    expect(intersection.timestamp).toEqual(orderOne.endTimeMs);
  });

  it("should return null for parallel lines that don't overlap", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1,
    };

    const orderTwo = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 2,
      endPriceEth: 2,
    };

    const intersection = getOrderIntersection(orderOne, orderTwo);
    expect(intersection).toBeNull();
  });

  it("should return the first intersection point if the intersection forms a line. orderOne === orderTwo", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 1,
    };

    const intersection = getOrderIntersection(orderOne, orderOne);
    if (intersection == null) {
      expect(intersection).toBeTruthy();
      return;
    }
    expect(intersection.timestamp).toBeCloseTo(orderOne.startTimeMs);
    expect(intersection.price).toBeCloseTo(orderOne.startPriceEth);
  });

  it("should return the first intersection point if the intersection forms a line. orderTwo is a subset of orderOne", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };
    const orderTwo = {
      startTimeMs: 125_000,
      endTimeMs: 175_000,
      startPriceEth: 1.25,
      endPriceEth: 1.75,
    };
    const intersection = getOrderIntersection(orderOne, orderTwo);
    if (intersection == null) {
      expect(intersection).toBeTruthy();
      return;
    }
    expect(intersection.timestamp).toBeCloseTo(orderTwo.startTimeMs);
    expect(intersection.price).toBeCloseTo(orderTwo.startPriceEth);
  });

  it("should return the first intersection point if the intersection forms a line. orderOne is a subset of orderTwo", () => {
    const orderOne = {
      startTimeMs: 125_000,
      endTimeMs: 175_000,
      startPriceEth: 1.25,
      endPriceEth: 1.75,
    };
    const orderTwo = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };
    const intersection = getOrderIntersection(orderOne, orderTwo);
    if (intersection == null) {
      expect(intersection).toBeTruthy();
      return;
    }
    expect(intersection.timestamp).toBeCloseTo(orderOne.startTimeMs);
    expect(intersection.price).toBeCloseTo(orderOne.startPriceEth);
  });

  it("should return the correct intersection point for a basic intersection", () => {
    const orderOne = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 1,
      endPriceEth: 2,
    };

    const orderTwo = {
      startTimeMs: 100_000,
      endTimeMs: 200_000,
      startPriceEth: 2,
      endPriceEth: 1,
    };

    const intersection = getOrderIntersection(orderOne, orderTwo);
    if (intersection == null) {
      expect(intersection).toBeTruthy();
      return;
    }
    expect(intersection.timestamp).toBeCloseTo(150_000);
    expect(intersection.price).toBeCloseTo(1.5);
  });
});
