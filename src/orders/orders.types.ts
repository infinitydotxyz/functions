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
