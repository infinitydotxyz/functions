import { ChainId, OrderSource } from '@infinityxyz/lib/types/core';
import {
  BaseSalesStats,
  ChangeInSalesStats,
  PrevBaseSalesStats,
  ProtocolFeeStats
} from '@infinityxyz/lib/types/core/Stats';

export enum AggregationInterval {
  FiveMinutes = 'fiveMinutes'
}

export interface SalesByBlockOptions {
  fromBlock: number;
  toBlock: number;
}
export interface SalesByTimestampOptions {
  from: number;
  to: number;
}

export type SalesRequestOptions = SalesByBlockOptions | SalesByTimestampOptions;

export type CurrentStats = BaseSalesStats & ProtocolFeeStats;

export type BaseStats = BaseSalesStats & PrevBaseSalesStats & ChangeInSalesStats & ProtocolFeeStats;

export interface SalesIntervalDoc {
  updatedAt: number;
  hasUnaggregatedSales: boolean;
  isAggregated: boolean;
  startTimestamp: number;
  endTimestamp: number;
  stats: CurrentStats;
}

export interface NftSaleEventV2 {
  data: {
    chainId: ChainId;
    txHash: string;
    logIndex: number;
    bundleIndex: number;
    blockNumber: number;
    marketplace: OrderSource;
    marketplaceAddress: string;
    seller: string;
    buyer: string;
    quantity: string;
    collectionAddress: string;
    collectionName: string;
    tokenId: string;
    tokenImage: string;
    saleTimestamp: number;
    salePrice: string;
    salePriceEth: number;
    saleCurrencyAddress: string;
    saleCurrencyDecimals: number;
    saleCurrencySymbol: string;
  };
  metadata: {
    timestamp: number;
    updatedAt: number;
    processed: boolean;
  };
}
