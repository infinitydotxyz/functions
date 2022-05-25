import { FirestoreOrderItem } from '@infinityxyz/lib/types/core';
import { OrderItemConstraint } from './order-item-constraint.abstract';

export class OrderItemTokenIdConstraint extends OrderItemConstraint {
  protected get score() {
    if (this.firestoreOrderItem.tokenId) {
      return 1;
    }
    return 0;
  }

  protected isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean {
    /**
     * we should restrict listings to for specific tokenIds
     * otherwise how do we find what token ids can be exchanged?
     * - we'd have to know what tokens the user owns and maintain this list of token ids
     */

    /**
     * if the order is a listing the tokenId is required but we don't care if the
     * offer is for this tokenId or any token in the collection
     */
    if (this.component.firestoreOrderItem.isSellOrder) {
      return orderItem.tokenId === this.component.firestoreOrderItem.tokenId || orderItem.tokenId === '';
    }

    /**
     * if the order is an offer and the token id is specified
     * then the constraint is only satisfied if the listing is for the same tokenId
     */
    if (this.component.firestoreOrderItem.tokenId) {
      return orderItem.tokenId === this.component.firestoreOrderItem.tokenId;
    }

    /**
     * the order is an offer and the tokenId is not specified
     * then the constraint is satisfied if the listing is for any tokenId in the collection
     */
    return true;
  }

  protected addConstraintToQuery(
    query: FirebaseFirestore.Query<FirestoreOrderItem>
  ): FirebaseFirestore.Query<FirestoreOrderItem> {
    if (this.component.firestoreOrderItem.isSellOrder) {
      return query; // TODO should we optimize this with a where('tokenId', 'in', ['', this.component.firestoreOrderItem.tokenId])?
    }

    if (this.component.firestoreOrderItem.tokenId) {
      return query.where('tokenId', '==', this.component.firestoreOrderItem.tokenId);
    }

    return query;
  }

  addOrderByToQuery(query: FirebaseFirestore.Query<FirestoreOrderItem>): {
    query: FirebaseFirestore.Query<FirestoreOrderItem>;
    getStartAfter: (
      item: FirestoreOrderItem,
      ref: FirebaseFirestore.DocumentReference<FirestoreOrderItem>
    ) => (string | number | FirebaseFirestore.DocumentReference<FirestoreOrderItem>)[];
  } {
    return {
      query,
      getStartAfter: (item: FirestoreOrderItem, lastItem: FirebaseFirestore.DocumentReference<FirestoreOrderItem>) => [
        lastItem
      ]
    };
  }
}
