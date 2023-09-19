import { OrderStatus } from '../api/orders/types';
import { AskEvents, BidEvents, OrderFilters, SaleEvents, SaleFilters } from './subscription';

interface Res<Events extends string, Filters extends string, Data = unknown> {
  event: Events;
  tags: Record<Filters, string>;
  data: Data;
  offset: string;
  published_at: number;
  type: 'event' | 'subscribe' | 'unsubscribe';
  status: 'success';
}

interface AskData {
  id: string;
  kind: string;
  side: 'sell';
  status: OrderStatus;
  tokenSetId: string;
  tokenSetSchemaHash: string;
  nonce: number;
  contract: string;
  maker: string;
  taker: string;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
    netAmount?: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  validFrom: number;
  validUntil: number;
  quantityFilled: number;
  quantityRemaining: number;
  criteria: {
    kind: string;
    data: unknown;
  };
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
  feeBps: number;
  feeBreakdown: unknown[];
  expiration: number;
  isReservoir: boolean | null;
  isDynamic: boolean;
  createdAt: string;
  updatedAt: string;
  rawData: unknown;
}

interface BidData {
  id: string;
  kind: string;
  side: 'buy';
  status: OrderStatus;
  tokenSetId: string;
  tokenSetSchemaHash: string;
  nonce: number;
  contract: string;
  maker: string;
  taker: string;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
    netAmount?: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  validFrom: number;
  validUntil: number;
  quantityFilled: number;
  quantityRemaining: number;
  criteria: {
    kind: string;
    data: unknown;
  };
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  };
  feeBps: number;
  feeBreakdown: unknown[];
  expiration: number;
  isReservoir: boolean | null;
  isDynamic: boolean;
  createdAt: string;
}

interface SaleData {
  id: string;
  token: {
    contract: string;
    tokenId: string;
    name: string;
    image: string;
    collection: {
      id: string;
      name: string;
    };
  };
  orderId: string;
  orderSource: string;
  orderSide: 'ask' | 'bid';
  orderKind: string;
  from: string;
  to: string;
  amount: string;
  fillSource: string;
  block: number;
  txHash: string;
  logIndex: number;
  batchIndex: number;
  timestamp: number;
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
    netAmount?: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  washTradingScore: number;
  createdAt: string;
  updatedAt: string;
}

export type AskResponse = Res<AskEvents, OrderFilters, AskData>;
export type BidResponse = Res<BidEvents, OrderFilters, BidData>;
export type SaleResponse = Res<SaleEvents, SaleFilters, SaleData>;

export type Responses = AskResponse | BidResponse | SaleResponse;

export type ResponseByEvent = {
  'ask.*': AskResponse;
  'ask.created': AskResponse;
  'ask.updated': AskResponse;
  'bid.*': BidResponse;
  'bid.created': BidResponse;
  'bid.updated': BidResponse;
  'sale.*': SaleResponse;
  'sale.created': SaleResponse;
  'sale.updated': SaleResponse;
  'sale.deleted': SaleResponse;
};
