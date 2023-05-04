import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';

export type OrderPriceIntersection = {
  timestamp: number;
  price: number;
  getPriceAtTime: (timestamp: number) => number | null;
};

export type Point = {
  x: number;
  y: number;
};

export type LineSegment = {
  start: Point;
  end: Point;
};

export type LineSegmentEquation = {
  slope: number;
  yIntercept: number;
  start: Point;
  end: Point;
};

export type GetPriceAtTimeForEquation = {
  slope: number;
  yIntercept: number;
  start: Pick<Point, 'x'>;
  end: Pick<Point, 'x'>;
};

export type OrderItemPrice = Pick<
  FirestoreOrderItem,
  'isSellOrder' | 'startTimeMs' | 'endTimeMs' | 'startPriceEth' | 'endPriceEth'
>;
