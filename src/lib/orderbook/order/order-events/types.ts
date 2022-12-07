import { ChainId } from '@infinityxyz/lib/types/core';

import { OrderStatus } from '@/lib/reservoir/api/orders/types';

import { RawOrder } from '../types';

export enum OrderEventKind {
  Created = 'CREATED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
  Sale = 'SALE',
  BalanceChange = 'BALANCE_CHANGE',
  ApprovalChange = 'APPROVAL_CHANGE',
  Bootstrap = 'BOOTSTRAP',
  Revalidation = 'REVALIDATION',
  PriceUpdate = 'PRICE_UPDATE'
}

export interface OrderEventMetadata {
  id: string;
  isSellOrder: boolean;
  orderId: string;
  chainId: ChainId;
  processed: boolean;
  migrationId: 1;
  eventKind: OrderEventKind;
  timestamp: number;
  eventSource: 'reservoir' | 'infinity-orderbook';
}

export interface BaseOrderEvent {
  metadata: OrderEventMetadata;
}

type SpecificOrderEventKind<T extends OrderEventKind> = Omit<OrderEventMetadata, 'eventKind'> & {
  eventKind: T;
};

export interface OrderCreatedEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Created>;

  data: {
    /**
     * an order is native if the original source is infinity
     *
     * orders that are not native are those created to
     * match other marketplace orders
     */
    isNative: boolean;
    order: RawOrder;
  };
}

export interface OrderCancelledEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Cancelled>;

  data: {
    txHash: string;
    txTimestamp: number;
    status: OrderStatus;
  };
}

export interface OrderExpiredEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Expired>;

  data: {
    status: OrderStatus;
  };
}

export interface OrderSaleEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Sale>;

  data: {
    txHash: string;
    txTimestamp: number;
    status: OrderStatus;
  };
}

export interface OrderBalanceChangeEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.BalanceChange>;

  data: {
    txHash: string;
    txTimestamp: number;
    status: OrderStatus;
  };
}

export interface OrderApprovalChangeEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.ApprovalChange>;

  data: {
    txHash: string;
    txTimestamp: number;
    status: OrderStatus;
  };
}

export interface OrderBootstrapEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Bootstrap>;

  data: {
    status: OrderStatus;
  };
}

export interface OrderRevalidationEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.Revalidation>;

  data: {
    status: OrderStatus;
  };
}

export interface OrderPriceUpdateEvent extends BaseOrderEvent {
  metadata: SpecificOrderEventKind<OrderEventKind.PriceUpdate>;

  data: {
    status: OrderStatus;
  };
}

export type OrderEventByKind = {
  [OrderEventKind.Created]: OrderCreatedEvent;
  [OrderEventKind.Cancelled]: OrderCancelledEvent;
  [OrderEventKind.Expired]: OrderExpiredEvent;
  [OrderEventKind.Sale]: OrderSaleEvent;
  [OrderEventKind.BalanceChange]: OrderBalanceChangeEvent;
  [OrderEventKind.ApprovalChange]: OrderApprovalChangeEvent;
  [OrderEventKind.Bootstrap]: OrderBootstrapEvent;
  [OrderEventKind.Revalidation]: OrderRevalidationEvent;
  [OrderEventKind.PriceUpdate]: OrderPriceUpdateEvent;
};

export type OrderEvents = OrderEventByKind[keyof OrderEventByKind];
