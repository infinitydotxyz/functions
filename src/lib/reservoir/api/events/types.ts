import { definitions } from '@reservoir0x/reservoir-kit-client';

import * as Orders from '../orders';

export type EventV2Kind =
  | 'new-order'
  | 'expiry'
  | 'sale'
  | 'cancel'
  | 'balance-change'
  | 'approval-change'
  | 'bootstrap'
  | 'revalidation'
  | 'reprice';

export interface ReservoirEventMetadata {
  id: number;
  kind: EventV2Kind;
  txHash?: string;
  txTimestamp?: number;
  createdAt?: string;
}

export interface AskV2Order {
  id: string;
  status: Orders.Types.OrderStatus;
  contract: string;
  tokenId: string;
  maker: string;
  price?: definitions['price'];
  quantityRemaining: number;
  nonce?: string;
  validFrom: number;
  validUntil: number;
  source: string;
  isDynamic: boolean;
}

export interface BidV1Order {
  id: string;
  status: Orders.Types.OrderStatus;
  contract: string;
  tokenSetId?: string;
  maker: string;
  price: number;
  value: number;
  quantityRemaining: number;
  nonce?: string;
  validFrom: number;
  validUntil: number;
  source: string;
  criteria?: {
    kind?: string;
    data?: {
      token?: {
        tokenId?: string;
        name?: string;
        image?: string;
      };
      collection?: {
        id?: string;
        name?: string;
        image?: string;
      };
    };
  };
}

export interface BidV3Order {
  id: string;
  status: Orders.Types.OrderStatus;
  contract: string;
  maker: string;
  price?: definitions['price'];
  quantityRemaining: number;
  nonce: string;
  validFrom: number;
  validUntil: number;
  rawData: any;
  kind: string;
  source: string;
  criteria?: {
    kind?: string;
    data?: {
      token?: {
        tokenId?: string;
        name?: string;
        image?: string;
      };
      collection?: {
        id: string;
        name: string;
        image: string;
      };
    };
  };
}

export interface AskV3Order {
  id: string;
  status: Orders.Types.OrderStatus;
  contract: string;
  maker: string;
  price?: definitions['price'];
  quantityRemaining: number;
  nonce: string;
  validFrom: number;
  validUntil: number;
  rawData: any;
  kind: string;
  source: string;
  isDynamic: boolean;
  criteria?: {
    kind?: string;
    data?: {
      token?: {
        tokenId?: string;
        name?: string;
        image?: string;
      };
      collection?: {
        id: string;
        name: string;
        image: string;
      };
    };
  };
}

export interface AskEventV2 {
  order: AskV2Order;
  event: ReservoirEventMetadata;
}

export interface BidEventV1 {
  bid: BidV1Order;
  event: ReservoirEventMetadata;
}

export interface AskEventV3 {
  order: AskV3Order;
  event: ReservoirEventMetadata;
}

export interface BidEventV3 {
  bid: BidV3Order;
  event: ReservoirEventMetadata;
}

export type ReservoirOrderEvent = BidEventV1 | AskEventV2;
