import {
  ChainId,
  ChainOBOrder,
  CollectionDisplayData,
  TokenStandard,
  UserDisplayData
} from '@infinityxyz/lib/types/core';

import { config } from '..';
import { Orderbook, Reservoir } from '../..';

export interface BaseRawOrder {
  id: string;
  chainId: ChainId;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
}

export interface RawOrderWithoutError extends BaseRawOrder {
  source: Reservoir.Api.Orders.Types.OrderKind;
  rawOrder: any;
  infinityOrderId: string;
  infinityOrder: ChainOBOrder;
  gasUsage: string;
  isDynamic: boolean;
}

export interface OrderError {
  errorCode: Orderbook.Errors.ErrorCode;
  value: string;
  source: Reservoir.Api.Orders.Types.OrderKind | 'unknown';
  type: 'unsupported' | 'unexpected';
}

export interface RawOrderWithError extends BaseRawOrder {
  error: OrderError;
}

export type RawOrder = RawOrderWithError | RawOrderWithoutError;

export type TokenKind = 'single-token' | 'token-list' | 'collection-wide';
export type CollectionKind = 'single-collection' | 'multi-collection';

export interface OrderKind {
  collectionKind: CollectionKind;

  isSubSetOrder: boolean;

  numItems: number;

  numTokens: number;
  numCollections: number;

  isDynamic: boolean;
  isPrivate: boolean;
}

export interface QueryableOrder {
  isSellOrder: boolean;
  /**
   * start times
   */
  startTime: number;
  endTime: number;
  startTimeMs: number;
  endTimeMs: number;

  maker: string;
  taker: string;

  numItems: number;

  currency: string;

  /**
   * base prices - does not include additional costs
   * needed to execute order
   */
  startPrice: string;
  endPrice: string;

  startPriceEth: number;
  endPriceEth: number;
  startPricePerItem: string;
  startPricePerItemEth: number;
  endPricePerItem: string;
  endPricePerItemEth: number;

  /**
   * gas to fulfill the order
   */
  gasUsageString: string;
  gasUsage: number;

  nonce: string;

  /**
   * gas to fulfill order on infinity
   */
  maxGasPrice: string;
  maxGasPriceGwei: number;
  maxGasPriceEth: number;

  /**
   * whether every item in the order has a blue check
   */
  hasBlueCheck: boolean;

  complication: string;

  sourceMarketplace: keyof typeof config;

  orderKind: OrderKind;

  status: Reservoir.Api.Orders.Types.OrderStatus;
  /**
   * is true if the order is `active` or `inactive`
   */
  isValid: boolean;
}

export interface BaseRawFirestoreOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: boolean;
  };
  error?: OrderError;

  rawOrder?: RawOrder;

  order?: QueryableOrder;
}

export interface RawFirestoreOrderWithError {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: true;
  };
  error: OrderError;

  rawOrder?: RawOrder;

  order?: QueryableOrder;
}

export interface RawFirestoreOrderWithoutError {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: false;
  };

  rawOrder: RawOrderWithoutError;

  order: QueryableOrder;
}

export type RawFirestoreOrder = RawFirestoreOrderWithError | RawFirestoreOrderWithoutError;

export interface BaseFirestoreOrderItem {
  chainId: ChainId;
  address: string;
  hasBlueCheck: boolean;
  slug: string;
  name: string;
  profileImage: string;
  bannerImage: string;
  tokenStandard: TokenStandard;
  kind: TokenKind;
}

export interface OrderItemToken {
  tokenId: string;
  name: string;
  numTraitTypes: number;
  image: string;
  tokenStandard: TokenStandard;
  quantity: number;
}
export interface SingleTokenOrderItem extends BaseFirestoreOrderItem {
  kind: 'single-token';
  token: OrderItemToken;
}

export interface TokenListOrderItem extends BaseFirestoreOrderItem {
  kind: 'token-list';
  tokens: OrderItemToken[];
}

export interface CollectionWideOrderItem extends BaseFirestoreOrderItem {
  kind: 'collection-wide';
}

export type OrderItem = CollectionWideOrderItem | SingleTokenOrderItem | TokenListOrderItem;
export interface FirestoreOrderCollection {
  collection: CollectionDisplayData;
  tokens: {
    hasBlueCheck: boolean;
    tokenId: string;
    name: string;
    numTraitTypes: number;
    image: string;
    tokenStandard: TokenStandard;
    numTokens: number;
  }[];
}

export interface BaseDisplayOrder {
  kind: CollectionKind;

  maker: UserDisplayData;
}

export interface SingleCollectionDisplayOrder extends BaseDisplayOrder {
  kind: 'single-collection';
  item: OrderItem;
}

export interface MultiCollectionDisplayOrder extends BaseDisplayOrder {
  kind: 'multi-collection';
  items: OrderItem[];
}

export type DisplayOrder = SingleCollectionDisplayOrder | MultiCollectionDisplayOrder;

export interface BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: boolean;
  };
  error?: OrderError;

  order?: QueryableOrder;

  displayOrder?: DisplayOrder;
}

export interface FirestoreDisplayOrderWithError extends BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: true;
  };
  error: OrderError;
}

export interface FirestoreDisplayOrderWithoutError extends BaseFirestoreDisplayOrder {
  metadata: {
    id: string;
    chainId: ChainId;
    source: Reservoir.Api.Orders.Types.OrderKind;
    updatedAt: number;
    createdAt: number;
    hasError: false;
  };
  order: QueryableOrder;
  displayOrder: DisplayOrder;
}

export type FirestoreDisplayOrder = FirestoreDisplayOrderWithError | FirestoreDisplayOrderWithoutError;
