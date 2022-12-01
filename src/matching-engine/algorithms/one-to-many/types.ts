import { FirestoreOrder, FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { OrderPriceIntersection } from '../../../utils/intersection.types';

export type OneToManyMatch = {
  firestoreOrder: FirestoreOrder;
  opposingFirestoreOrders: FirestoreOrder[];
  intersection: OrderPriceIntersection;
  edges: { from: FirestoreOrderItem; to: FirestoreOrderItem; numItems: number }[];
};
