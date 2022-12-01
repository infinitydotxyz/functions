import {
  FirestoreOrder,
  FirestoreOrderItem,
  FirestoreOrderMatchOneToMany,
  FirestoreOrderMatches
} from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import * as Algorithms from '../algorithms';
import { Node } from '../graph/node';
import { OrderNodeCollection } from '../graph/order-node-collection';
import { Order } from './order';
import { OrderItem } from './order-item';
import { OrderItem as IOrderItem } from './orders.types';

export class OrdersGraph {
  constructor(public root: Node<Order>) {}

  public async search(
    possibleMatches?: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]
  ): Promise<{ matches: FirestoreOrderMatches[]; requiresScan: FirestoreOrder[] }> {
    const rootOrderNode = await this.getRootOrderNode();

    if (!possibleMatches) {
      possibleMatches = [];
      for (const orderItemNode of rootOrderNode.nodes) {
        const iterator = orderItemNode.data.orderItem.getPossibleMatches();
        const orderItemPossibleMatches: FirestoreOrderItem[] = [];
        for await (const possibleMatch of iterator) {
          orderItemPossibleMatches.push(possibleMatch);
        }
        possibleMatches.push({
          orderItem: orderItemNode.data.orderItem,
          possibleMatches: orderItemPossibleMatches
        });
      }
    }

    const log = (msg: string, options?: { step?: string }) => {
      const stepString = options?.step ? ` [${options.step}] ` : '';
      const indentation = [options?.step].filter((part) => !!part).length;
      const formattedMsg = `${'  '.repeat(indentation)}[${
        rootOrderNode.data.order.firestoreOrder.id
      }]${stepString} ${msg}`;
      console.log(formattedMsg);
    };
    log('Searching for matches...');

    log(`Found: ${possibleMatches.length} possible matches`, { step: 'possible matches' });
    const matchingOrderNodes = await this.getMatches(possibleMatches);
    log(`Found: ${matchingOrderNodes.length} matching orders`, { step: 'filtering possible matches' });
    const oneToOne = this.searchOneToOne(rootOrderNode, matchingOrderNodes, (message: string) => {
      log(message, { step: 'one to one' });
    });
    log(`Found: ${oneToOne.length} one to one matches`);
    const oneToManyMatches = this.searchOneToMany(rootOrderNode, matchingOrderNodes, (message: string) => {
      log(message, { step: 'one to many' });
    });
    log(`Found: ${oneToManyMatches.length} one to many matches`);

    const firestoreMatches = [...oneToOne, ...oneToManyMatches];

    let requiresScan: FirestoreOrder[] = [];
    if (rootOrderNode.data.order.firestoreOrder.numItems === 1) {
      requiresScan = matchingOrderNodes
        .filter((item) => item.data.order.firestoreOrder.numItems > 1)
        .map((item) => item.data.order.firestoreOrder);
    }

    return { matches: firestoreMatches, requiresScan };
  }

  public searchOneToOne(
    rootOrderNode: OrderNodeCollection,
    matchingOrderNodes: OrderNodeCollection[],
    log: (message: string) => void
  ) {
    try {
      const searcher = new Algorithms.OneToOne.MatchSearch(rootOrderNode, matchingOrderNodes, log);
      const matches = searcher.search();
      const firestoreMatches = matches.map((item) =>
        rootOrderNode.data.order.getFirestoreOrderMatch(item, item.price, item.timestamp)
      );

      return firestoreMatches;
    } catch (err) {
      log(err as string);
      return [];
    }
  }

  public searchOneToMany(
    rootOrderNode: OrderNodeCollection,
    matchingOrderNodes: OrderNodeCollection[],
    log: (message: string) => void
  ) {
    log(`Searching for one to many matches With ${matchingOrderNodes.length} matching orders`);
    try {
      const isValid = this.verifyOneToManyRootOrderNode(rootOrderNode);
      if (!isValid) {
        log('Root order node is not fully specified or has a num items less than one');
        return [];
      }
      const oneToManyMatchingOrderNodes = this.filterOneToManyMatches(matchingOrderNodes);
      const searcher = new Algorithms.OneToMany.MatchSearch(rootOrderNode, oneToManyMatchingOrderNodes, log);
      const matches = searcher.search();

      const firestoreOrderMatches: FirestoreOrderMatches[] = matches.map((item) => {
        return this.transformOrderMatchToFirestoreOrderMatch(item);
      });

      return firestoreOrderMatches;
    } catch (err) {
      log(err as string);
      return [];
    }
  }

  private transformOrderMatchToFirestoreOrderMatch({
    intersection,
    edges
  }: Algorithms.OneToMany.Match): FirestoreOrderMatchOneToMany {
    const orderItemMatches = edges.map((item) => {
      return {
        orderItem: item.from,
        opposingOrderItem: item.to
      };
    });
    const orderMatch = this.root.data.getFirestoreOrderMatchOneToMany(
      orderItemMatches,
      intersection.price,
      intersection.timestamp
    );
    return orderMatch;
  }

  private async getRootOrderNode(): Promise<OrderNodeCollection> {
    this.root.unlink();
    const rootOrderNode = await this.getOrderNode(this.root.data.firestoreOrder, true);
    return rootOrderNode;
  }

  private verifyOneToManyRootOrderNode(rootOrderNode: OrderNodeCollection) {
    const isFullySpecified = Order.isFullySpecified(rootOrderNode.data.orderItems);

    const validNumItems = rootOrderNode.data.order.firestoreOrder.numItems > 1;
    return isFullySpecified && validNumItems;
  }

  private filterOneToManyMatches(matches: OrderNodeCollection[]) {
    return matches.filter((item) => {
      // return this.root.data.firestoreOrder.numItems > item.data.order.firestoreOrder.numItems;
      return item.data.order.firestoreOrder.numItems === 1;
    });
  }

  private async getMatches(
    possibilities: { orderItem: IOrderItem; possibleMatches: FirestoreOrderItem[] }[]
  ): Promise<OrderNodeCollection[]> {
    const db = getDb();
    const orderIds = new Set<string>();
    const orderNodes: OrderNodeCollection[] = [];
    for (const { orderItem, possibleMatches } of possibilities) {
      for (const possibleMatch of possibleMatches) {
        const validationResponse = orderItem.isMatch(possibleMatch);
        if (validationResponse.isValid && !orderIds.has(possibleMatch.id)) {
          orderIds.add(possibleMatch.id);
          const orderItem = new OrderItem(possibleMatch, db);
          const firestoreOrder = (await orderItem.orderRef.get()).data();
          if (firestoreOrder) {
            const orderNode = await this.getOrderNode(firestoreOrder, false);
            orderNodes.push(orderNode);
          }
        }
      }
    }
    return orderNodes;
  }

  private async getOrderNode(firestoreOrder: FirestoreOrder, isRoot: boolean) {
    const order = new Order(firestoreOrder);
    const orderItems = await order.getOrderItems();
    const orderNodeCollection = new OrderNodeCollection(order, orderItems, !isRoot);
    return orderNodeCollection;
  }
}
