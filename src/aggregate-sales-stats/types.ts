import {
  BaseSalesStats,
  ChangeInSalesStats,
  PrevBaseSalesStats,
  ProtocolFeeStats,
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
