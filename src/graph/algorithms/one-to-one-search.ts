import { Order } from '../../orders/order';
import { OrderItem as IOrderItem, OrderItemMatch } from '../../orders/orders.types';
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

      const matches = this.checkForMatches(
        opposingOrderItems,
        {
          order,
          orderItems
        },
        order.firestoreOrder.numItems
      );

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

        if (orderItem.isMatch(opposingOrderItem.firestoreOrderItem)) {
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
      return [];
    }

    const combinations = generateMatchCombinations(orderItems, opposingOrder.orderItems);
    const validCombinations = combinations.filter((path) => {
      return (
        path.matches.length >= minOrderItemsToFulfill &&
        this.validateMatchForOpposingOrder(path.matches, opposingOrder.order)
      );
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

  public validateMatchForOpposingOrder(matches: OrderItemMatch[], opposingOrder: Order): boolean {
    const matchesValid = matches.every((match) => match.opposingOrderItem.isMatch(match.orderItem.firestoreOrderItem));
    const isNumItemsValid = this.isNumItemsValid(opposingOrder.firestoreOrder.numItems, matches.length);
    return isNumItemsValid && matchesValid;
  }

  private isNumItemsValid(opposingOrderNumItems: number, numMatches: number) {
    const isOpposingOrderBuyOrder = this.rootOrderNode.data.order.firestoreOrder.isSellOrder;
    if (isOpposingOrderBuyOrder) {
      const numItemsValid =
        numMatches >= opposingOrderNumItems && this.rootOrderNode.data.order.firestoreOrder.numItems <= numMatches;
      return numItemsValid;
    }
    const numItemsValid =
      numMatches <= opposingOrderNumItems && this.rootOrderNode.data.order.firestoreOrder.numItems >= numMatches;
    return numItemsValid;
  }
}
