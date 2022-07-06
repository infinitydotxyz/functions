import { Order } from '../../orders/order';
import { OrderItem as IOrderItem, OrderItemMatch, ValidationResponse } from '../../orders/orders.types';
import { getOrderIntersection } from '../../utils/intersection';
import { OrderMatchSearch } from './order-match-search.abstract';

export type OneToOneMatch = {
  order: Order;
  orderItems: IOrderItem[];
  matches: OrderItemMatch[];
  price: number;
  timestamp: number;
};

export class OneToOneOrderMatchSearch extends OrderMatchSearch<OneToOneMatch> {
  public search(): OneToOneMatch[] {
    const order = this.rootOrderNode.data.order;
    const orderItems = this.rootOrderNode.data.orderItems;
    const fullMatches: {
      order: Order;
      orderItems: IOrderItem[];
      matches: OrderItemMatch[];
      price: number;
      timestamp: number;
    }[] = [];

    for (const orderNode of this.matchingOrderNodes) {
      const opposingOrder = orderNode.data.order;
      const opposingOrderItems = orderNode.data.orderItems;

      console.log(`searching for matches between ${order.firestoreOrder.id} and ${opposingOrder.firestoreOrder.id}`);
      const matches = this.checkForMatches(
        orderItems,
        {
          order: opposingOrder,
          orderItems: opposingOrderItems
        },
        order.firestoreOrder.numItems
      );
      console.log(`Found ${matches.length} combinations of matches`);

      const bestFullMatch = this.getBestMatch(matches, order.firestoreOrder.numItems);
      if (bestFullMatch.isMatch) {
        fullMatches.push({
          order,
          orderItems,
          ...opposingOrder,
          matches: bestFullMatch.match,
          price: bestFullMatch.price,
          timestamp: bestFullMatch.timestamp
        });
      }
    }

    return fullMatches;
  }

  public getBestMatch(
    matches: { match: OrderItemMatch[]; price: number; timestamp: number }[],
    minOrderItemsToFulfill: number
  ): { isMatch: false } | { isMatch: true; match: OrderItemMatch[]; price: number; timestamp: number } {
    const validCombinationsSortedByNumMatches = matches.sort((itemA, itemB) => itemB.match.length - itemA.match.length);

    /**
     * prefer the combination that fulfills the maximum number of order items
     */
    const bestMatch = validCombinationsSortedByNumMatches[0];
    if (!bestMatch || bestMatch.match.length < minOrderItemsToFulfill) {
      return {
        isMatch: false
      };
    }

    return {
      isMatch: true,
      ...bestMatch
    };
  }

  public checkForMatches(
    orderItems: IOrderItem[],
    opposingOrder: { order: Order; orderItems: IOrderItem[] },
    minOrderItemsToFulfill: number
  ): { match: OrderItemMatch[]; price: number; timestamp: number }[] {
    const generateMatchCombinations = (
      orderItems: IOrderItem[],
      opposingOrderItems: IOrderItem[]
    ): { matches: OrderItemMatch[] }[] => {
      const orderItemsCopy = [...orderItems];
      const opposingOrderItemsCopy = [...opposingOrderItems];
      const orderItem = orderItemsCopy.shift();

      if (!orderItem) {
        return [];
      }

      const paths = opposingOrderItemsCopy.flatMap((opposingOrderItem, index) => {
        let subPaths: { matches: OrderItemMatch[] }[] = [];

        const isMatch = orderItem.isMatch(opposingOrderItem.firestoreOrderItem).isValid;
        if (isMatch) {
          const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
          unclaimedOpposingOrders.splice(index, 1);
          const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
          const match: OrderItemMatch = { orderItem: orderItem, opposingOrderItem: opposingOrderItem };
          const subPathsWithMatch = sub.map(({ matches }) => {
            return { matches: [match, ...matches] };
          });
          subPaths = [...subPaths, { matches: [match] }, ...subPathsWithMatch];
        }

        const unclaimedOpposingOrders = [...opposingOrderItemsCopy];
        const sub = generateMatchCombinations([...orderItemsCopy], unclaimedOpposingOrders);
        const subPathsWithoutMatch = sub.map(({ matches }) => {
          return { matches: [...matches] };
        });
        subPaths = [...subPaths, ...subPathsWithoutMatch];

        return subPaths;
      });
      return paths;
    };

    const priceIntersection = getOrderIntersection(
      this.rootOrderNode.data.order.firestoreOrder,
      opposingOrder.order.firestoreOrder
    );
    if (priceIntersection === null) {
      console.log(`No price intersection`);
      return [];
    }

    const combinations = generateMatchCombinations(orderItems, opposingOrder.orderItems);
    console.log(`Found ${combinations.length} combinations`);
    const validCombinations = combinations.filter((path) => {
      const numMatchesValid = path.matches.length >= minOrderItemsToFulfill;
      if(!numMatchesValid) {
        console.log(`Combination has ${path.matches.length} matches but needs ${minOrderItemsToFulfill} matches`);
        return false;
      }
      const opposingOrderValidationResponse = this.validateMatchForOpposingOrder(path.matches, opposingOrder.order);
      if(!opposingOrderValidationResponse.isValid) {
        console.log(`Opposing order validation failed: ${opposingOrderValidationResponse.reasons.join(', ')}`);
      }
      return numMatchesValid && opposingOrderValidationResponse.isValid;
    });

    const validAfter = priceIntersection.timestamp;
    const isFutureMatch = validAfter > Date.now();

    if (isFutureMatch) {
      return validCombinations.map((item) => {
        return {
          match: item.matches,
          price: priceIntersection.price,
          timestamp: priceIntersection.timestamp
        };
      });
    }

    const now = Date.now();
    const currentPrice = priceIntersection.getPriceAtTime(now);
    if (currentPrice === null) {
      return [];
    }

    return validCombinations.map((item) => {
      return {
        match: item.matches,
        price: currentPrice,
        timestamp: now
      };
    });
  }

  public validateMatchForOpposingOrder(matches: OrderItemMatch[], opposingOrder: Order): ValidationResponse {
    const matchesValidResponse = matches.reduce((acc: ValidationResponse, match) => {
      const response = match.opposingOrderItem.isMatch(match.orderItem.firestoreOrderItem);
      const reasons = acc.isValid ? [] : acc.reasons;
      const responseReasons = response.isValid ? [] : response.reasons;
      return {
        isValid: acc.isValid && response.isValid,
        reasons: [...reasons, ...responseReasons]
      }
    }, { isValid: true, reasons: [] });
    if(!matchesValidResponse.isValid) {
      return matchesValidResponse;
    }

    const numItemsValidationResponse = this.isNumItemsValid(opposingOrder.firestoreOrder.numItems, matches.length);
    if (!numItemsValidationResponse.isValid) {
      return numItemsValidationResponse;
    }

    return {
      isValid: true,
    }
  }

  private isNumItemsValid(opposingOrderNumItems: number, numMatches: number): ValidationResponse {
    const isOpposingOrderBuyOrder = this.rootOrderNode.data.order.firestoreOrder.isSellOrder;
    if (isOpposingOrderBuyOrder) {
      const buyOrderNumItemsAtLeastNumMatches = numMatches >= opposingOrderNumItems;
      const sellOrderNumItemsAtMostNumMatches = this.rootOrderNode.data.order.firestoreOrder.numItems <= numMatches;
      if (!buyOrderNumItemsAtLeastNumMatches) {
        return {
          isValid: false,
          reasons: [`Buy order requires at least ${opposingOrderNumItems} items, but found ${numMatches} items`]
        };
      }

      if (!sellOrderNumItemsAtMostNumMatches) {
        return {
          isValid: false,
          reasons: [
            `Sell order requires at most ${this.rootOrderNode.data.order.firestoreOrder.numItems} items, but found ${numMatches} items`
          ]
        };
      }
      return {
        isValid: true
      };
    }

    const buyOrderNumItemsAtLeastNumMatches = numMatches >= this.rootOrderNode.data.order.firestoreOrder.numItems;
    const sellOrderNumItemsAtMostNumMatches = opposingOrderNumItems <= numMatches;
    if (!buyOrderNumItemsAtLeastNumMatches) {
      return {
        isValid: false,
        reasons: [
          `Buy order requires at least ${this.rootOrderNode.data.order.firestoreOrder.numItems} items, but found ${numMatches} items`
        ]
      };
    }

    if (!sellOrderNumItemsAtMostNumMatches) {
      return {
        isValid: false,
        reasons: [`Sell order requires at most ${opposingOrderNumItems} items, but found ${numMatches} items`]
      };
    }
    return {
      isValid: true
    };
  }
}
