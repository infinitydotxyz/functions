import { OrderSource } from '@infinityxyz/lib/types/core';
import { definitions } from '@reservoir0x/reservoir-kit-client';

export type OrderStatus = 'active' | 'inactive' | 'expired' | 'cancelled' | 'filled';
export type OrderKind = OrderSource;

export interface BaseOrder {
  id: string;
  kind: OrderKind;
  side: 'buy' | 'sell';
  tokenSetId: string;
  tokenSetSchemaHash: string;
  contract?: string;
  maker: string;
  taker: string;
  price?: definitions['price'];
  validFrom: number;
  validUntil: number;
  quantityFilled?: number;
  quantityRemaining?: number;
  metadata?: definitions['Model103'];
  status: OrderStatus;
  source?: definitions['source'];
  feeBps?: number;
  feeBreakdown?: definitions['Model105'];
  expiration: number;
  isReservoir?: boolean;
  createdAt: string;
  updatedAt: string;
  rawData?: definitions['source'];
}

export interface AskOrder extends BaseOrder {
  isDynamic?: boolean;
}
export type BidOrder = BaseOrder;

export type Order = AskOrder | BidOrder;
