import { ChainNFTs, SaleSource, TokenStandard } from '@infinityxyz/lib/types/core';

export interface PreParsedInfinityNftSale {
  chainId: string;
  txHash: string;
  transactionIndex: number;
  complication: string;
  source: SaleSource;
  paymentToken: string;
  price: bigint;
  buyer: string;
  seller: string;
  quantity: number;
  tokenStandard: TokenStandard;
  orderItems: ChainNFTs[];
}

export interface PreParsedInfinityNftSaleInfo {
  paymentToken: string;
  price: bigint;
  protocolFeeBPS: number;
  protocolFeeWei: string;
  buyer: string;
  seller: string;
  quantity: number;
  tokenStandard: TokenStandard;
  orderItems: ChainNFTs[];
}

export interface PreParsedInfinityNftSaleInfoMatchOrder extends PreParsedInfinityNftSaleInfo {
  buyOrderHash: string;
  sellOrderHash: string;
}

export interface PreParseInfinityMultipleNftSaleBase {
  chainId: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  complication: string;
  source: SaleSource;
}

export interface PreParseInfinityMultipleNftSaleMatchOrder extends PreParseInfinityMultipleNftSaleBase {
  sales: PreParsedInfinityNftSaleInfoMatchOrder[];
}

export type MatchOrderEvent = PreParsedInfinityNftSale & { buyOrderHash: string; sellOrderHash: string };
export type MatchOrderBundleEvent = { blockNumber: number; events: PreParseInfinityMultipleNftSaleMatchOrder };
export type TakeOrderEvent = PreParsedInfinityNftSale & { orderHash: string };
