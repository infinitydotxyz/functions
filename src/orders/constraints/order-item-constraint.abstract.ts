import { FirestoreOrderItem } from '@infinityxyz/lib/types/core/OBOrder';
import { OrderItem as IOrderItem, OrderItem } from '../orders.types';

export abstract class OrderItemConstraint implements IOrderItem {
    public component: OrderItem;
  
    constructor(orderItem: OrderItem) {
      this.component = orderItem;
    }
  
    get isAuction(): boolean {
      return this.component.isAuction;
    }
  
    get firestoreOrderItem(): FirestoreOrderItem {
      return this.component.firestoreOrderItem;
    }
  
    /**
     * provides an estimate of how restrictive the order is
     */
    get constraintScore(): number {
      return this.score + this.component.constraintScore;
    }
  
    getNumConstraints(): number {
      return this.component.getNumConstraints() + 1;
    }
  
    isMatch(orderItem: FirestoreOrderItem): boolean {
      const isThisSatisfied = this.isConstraintSatisfied(orderItem);
      const isComponentSatisfied = this.component.isMatch(orderItem);
      return isThisSatisfied && isComponentSatisfied;
    }
  
    getPossibleMatches(query: FirebaseFirestore.Query<FirestoreOrderItem>): AsyncGenerator<FirestoreOrderItem> {
      const updatedQuery = this.addConstraintToQuery(query);
      return this.component.getPossibleMatches(updatedQuery);
    }
  
    protected abstract score: number;
  
    protected abstract isConstraintSatisfied(orderItem: FirestoreOrderItem): boolean;
  
    protected abstract addConstraintToQuery(
      query: FirebaseFirestore.Query<FirestoreOrderItem>
    ): FirebaseFirestore.Query<FirestoreOrderItem>;
  }
  