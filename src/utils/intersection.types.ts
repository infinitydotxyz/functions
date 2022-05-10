export type OrderPriceIntersection = {
  timestamp: number;
  price: number;
} | null;

export type Point = {
  x: number;
  y: number;
};

export type LineSegment = {
  start: Point;
  end: Point;
};
