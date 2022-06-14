import { getOBOrderPrice } from '@infinityxyz/lib/utils';
import { ethers } from 'ethers';
import { OrderItemPrice } from '../orders/orders.types';
import { LineSegment, OrderPriceIntersection, Point } from './intersection.types';

export function getOrderIntersection(one: OrderItemPrice, two: OrderItemPrice): OrderPriceIntersection {
  const segmentOne: LineSegment = {
    start: {
      x: one.startTimeMs,
      y: one.startPriceEth
    },
    end: {
      x: one.endTimeMs,
      y: one.endPriceEth
    }
  };

  const segmentTwo: LineSegment = {
    start: {
      x: two.startTimeMs,
      y: two.startPriceEth
    },
    end: {
      x: two.endTimeMs,
      y: two.endPriceEth
    }
  };

  const intersection = getIntersection(segmentOne, segmentTwo);

  if (intersection === null) {
    const [listing, offer] = one.isSellOrder ? [one, two] : [two, one];
    const timestampsOverlap = listing.startTimeMs <= offer.endTimeMs && listing.endTimeMs >= offer.startTimeMs;
    if (timestampsOverlap) {
      const timeValid = Math.max(listing.startTimeMs, offer.startTimeMs);
      const listingOrderPrice = getOBOrderPrice(listing, timeValid);
      const offerOrderPrice = getOBOrderPrice(offer, timeValid);
      const offerPriceIsGreaterThanListingPrice = offerOrderPrice.gte(listingOrderPrice);

      if (offerPriceIsGreaterThanListingPrice) {
        const nearestSecond = Math.ceil(timeValid / 1000) * 1000;
        const getPriceAtTime = (timestamp: number) => {
          const listingPrice = getOBOrderPrice(listing, timestamp);
          return parseFloat(ethers.utils.formatEther(listingPrice));
        };
        return {
          timestamp: nearestSecond,
          price: getPriceAtTime(nearestSecond),
          getPriceAtTime
        };
      }
    }

    return null;
  }

  const nearestSecond = Math.ceil(intersection.x / 1000) * 1000;
  const segmentOneSlope = (segmentOne.end.y - segmentOne.start.y) / (segmentOne.end.x - segmentOne.start.x);
  const yIntercept = segmentOne.start.y - segmentOneSlope * segmentOne.start.x;

  const getPriceAtTime = (timestamp: number) => {
    return segmentOneSlope * timestamp + yIntercept;
  };

  return {
    timestamp: nearestSecond,
    price: getPriceAtTime(nearestSecond),
    getPriceAtTime
  };
}

export function getIntersection(one: LineSegment, two: LineSegment): Point | null {
  const numerator =
    (one.start.x - two.start.x) * (two.start.y - two.end.y) - (one.start.y - two.start.y) * (two.start.x - two.end.x);
  const denominator =
    (one.start.x - one.end.x) * (two.start.y - two.end.y) - (one.start.y - one.end.y) * (two.start.x - two.end.x);
  const bezierParam = numerator / denominator;

  if (bezierParam < 0 || bezierParam > 1) {
    return null; // no intersection
  }

  if (Number.isNaN(bezierParam)) {
    // line intersection is a line segment
    const intersectionX = one.start.x < two.start.x ? two.start.x : one.start.x;
    const intersectionY = one.start.y < two.start.y ? two.start.y : one.start.y;
    return {
      x: intersectionX,
      y: intersectionY
    };
  }

  // line intersection is a point
  const intersectionX = one.start.x + bezierParam * (one.end.x - one.start.x);
  const intersectionY = one.start.y + bezierParam * (one.end.y - one.start.y);

  return {
    x: intersectionX,
    y: intersectionY
  };
}