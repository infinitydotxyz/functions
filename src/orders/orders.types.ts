import { FirestoreOrderItem } from "@infinityxyz/lib/types/core/OBOrder";

export interface FirestoreOrderMatch {
  /**
   * id of the firestore order that is a match
   */
  id: string;

  /**
   * timestamp that the orders become valid
   * matches
   */
  timestamp: number;

  /**
   * the price of the match
   */
  price: number;
}


export type OrderItemPrice = Pick<FirestoreOrderItem, 'startTimeMs' | 'endTimeMs' | 'startPriceEth' | 'endPriceEth'>;