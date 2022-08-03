import { Stats } from "@infinityxyz/lib/types/core/Stats";

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

export type CurrentStats = Pick<Stats, 'floorPrice' | 'numSales' | 'ceilPrice' | 'volume' | 'avgPrice'> &
  Partial<ProtocolFeeStats>;

export type PrevStats = Pick<
  Stats,
  'prevFloorPrice' | 'prevCeilPrice' | 'prevVolume' | 'prevNumSales' | 'prevAvgPrice'
>;
export type ChangeInStats = Pick<
  Stats,
  | 'floorPricePercentChange'
  | 'ceilPricePercentChange'
  | 'volumePercentChange'
  | 'numSalesPercentChange'
  | 'avgPricePercentChange'
>;
export type BaseStats = CurrentStats & PrevStats & ChangeInStats;

export interface SalesIntervalDoc {
  updatedAt: number;
  hasUnaggregatedSales: boolean;
  isAggregated: boolean;
  startTimestamp: number;
  endTimestamp: number;
  stats: CurrentStats;
}

export interface ProtocolFeeStats {
  minProtocolFeeWei: string | null;
  maxProtocolFeeWei: string | null;
  avgProtocolFeeWei: string | null;
  sumProtocolFeeWei: string;
  numSalesWithProtocolFee: number;
}
