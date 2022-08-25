import { ChainId, NftSale, SaleSource, StatsPeriod } from '@infinityxyz/lib/types/core';
import { formatEther } from 'ethers/lib/utils';
import { AggregationInterval, CurrentStats } from '../types';
import { calculateStats, calculateStatsBigInt, getIntervalAggregationId, getStatsDocInfo } from '../utils';

type SalesById<T extends NftSale> = Map<string, { sales: T[] }>;
type SalesByPeriod<T extends NftSale> = Map<StatsPeriod, SalesById<T>>;

export type SalesByAggregationInterval<T extends NftSale> = Map<AggregationInterval, SalesById<T>>;

export type CollectionSalesByInterval<T extends NftSale> = {
  salesByInterval: SalesByAggregationInterval<T>;
  collectionAddress: string;
  chainId: ChainId;
};
export type NftSalesByInterval<T extends NftSale> = {
  salesByInterval: SalesByAggregationInterval<T>;
  collectionAddress: string;
  chainId: ChainId;
  tokenId: string;
};
export type SourceSalesByInterval<T extends NftSale> = {
  salesByInterval: SalesByAggregationInterval<T>;
  source: SaleSource;
};

export type CollectionSalesByPeriod<T extends NftSale> = {
  salesByPeriod: SalesByPeriod<T>;
  collectionAddress: string;
  chainId: ChainId;
};
export type NftSalesByPeriod<T extends NftSale> = {
  salesByPeriod: SalesByPeriod<T>;
  collectionAddress: string;
  chainId: ChainId;
  tokenId: string;
};

export class Sales<T extends NftSale> {
  public allSales: Iterable<T>;
  public allSalesByPeriod: SalesByPeriod<T>;
  public salesBySource: Map<SaleSource, T[]>;
  public salesByCollection: Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId }>;
  public salesByNft: Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId; tokenId: string }>;
  public salesByCollectionByPeriod: Map<string, CollectionSalesByPeriod<T>>;
  public salesByNftByPeriod: Map<string, NftSalesByPeriod<T>>;
  public salesByCollectionByInterval: Map<string, CollectionSalesByInterval<T>>;
  public salesByNftByInterval: Map<string, NftSalesByInterval<T>>;
  public salesBySourceByInterval: Map<SaleSource, SourceSalesByInterval<T>>;

  constructor(sales: Iterable<T>) {
    this.allSales = sales;
    this.allSalesByPeriod = this.groupSalesByPeriod(sales);
    const { salesByCollection, salesByNft } = this.groupSales(sales);
    this.salesByCollection = salesByCollection;
    this.salesByNft = salesByNft;

    this.salesByCollectionByPeriod = new Map<string, CollectionSalesByPeriod<T>>();
    for (const [collectionId, collectionSales] of this.salesByCollection) {
      const collectionSalesByPeriod = this.groupSalesByPeriod(collectionSales.sales);
      this.salesByCollectionByPeriod.set(collectionId, {
        salesByPeriod: collectionSalesByPeriod,
        collectionAddress: collectionSales.collectionAddress,
        chainId: collectionSales.chainId
      });
    }

    this.salesByNftByPeriod = new Map<string, NftSalesByPeriod<T>>();
    for (const [nftId, nftSales] of this.salesByNft) {
      const nftSalesByPeriod = this.groupSalesByPeriod(nftSales.sales);
      this.salesByNftByPeriod.set(nftId, {
        salesByPeriod: nftSalesByPeriod,
        collectionAddress: nftSales.collectionAddress,
        chainId: nftSales.chainId,
        tokenId: nftSales.tokenId
      });
    }

    this.salesByCollectionByInterval = new Map<string, CollectionSalesByInterval<T>>();
    for (const [collectionId, collectionSales] of this.salesByCollection) {
      const collectionSalesByInterval = this.groupSalesByInterval(collectionSales.sales);
      this.salesByCollectionByInterval.set(collectionId, {
        salesByInterval: collectionSalesByInterval,
        collectionAddress: collectionSales.collectionAddress,
        chainId: collectionSales.chainId
      });
    }

    this.salesByNftByInterval = new Map<string, NftSalesByInterval<T>>();
    for (const [nftId, nftSales] of this.salesByNft) {
      const nftSalesByInterval = this.groupSalesByInterval(nftSales.sales);
      this.salesByNftByInterval.set(nftId, {
        salesByInterval: nftSalesByInterval,
        collectionAddress: nftSales.collectionAddress,
        chainId: nftSales.chainId,
        tokenId: nftSales.tokenId
      });
    }

    this.salesBySource = new Map<SaleSource, T[]>();
    for (const sale of sales) {
      let sourceSales = this.salesBySource.get(sale.source);
      if (!sourceSales) {
        sourceSales = [];
        this.salesBySource.set(sale.source, sourceSales);
      }
      sourceSales.push(sale);
    }

    this.salesBySourceByInterval = new Map<SaleSource, SourceSalesByInterval<T>>();
    for (const [source, sourceSales] of this.salesBySource) {
      const sourceSalesByInterval = this.groupSalesByInterval(sourceSales);
      this.salesBySourceByInterval.set(source, { source, salesByInterval: sourceSalesByInterval });
    }
  }

  public static getStats<T extends NftSale>(sales: Iterable<T>): CurrentStats {
    const priceStatsEth = calculateStats(sales, (sale: T) => sale.price);
    const protocolFeeWeiStats = calculateStatsBigInt(sales, (sale: T) =>
      'protocolFeeWei' in sale ? BigInt(sale.protocolFeeWei) : null
    );

    return {
      floorPrice: priceStatsEth.min as number,
      ceilPrice: priceStatsEth.max as number,
      numSales: priceStatsEth.numItems,
      volume: priceStatsEth.sum,
      avgPrice: priceStatsEth.avg as number,
      minProtocolFeeWei: protocolFeeWeiStats.min?.toString() ?? null,
      maxProtocolFeeWei: protocolFeeWeiStats.max?.toString() ?? null,
      avgProtocolFeeWei: protocolFeeWeiStats.avg?.toString() ?? null,
      sumProtocolFeeWei: protocolFeeWeiStats.sum.toString(),
      numSalesWithProtocolFee: protocolFeeWeiStats.numItemsInAvg,
      sumProtocolFeeEth: parseFloat(formatEther(protocolFeeWeiStats.sum.toString()))
    };
  }

  private groupSalesByInterval(sales: Iterable<T>): SalesByAggregationInterval<T> {
    const salesByInterval: SalesByAggregationInterval<T> = new Map();

    const getInterval = (interval: AggregationInterval, salesByInterval: Map<AggregationInterval, SalesById<T>>) => {
      let intervalSales = salesByInterval.get(interval);

      if (!intervalSales) {
        intervalSales = new Map();
        salesByInterval.set(interval, intervalSales);
        return intervalSales;
      }
      return intervalSales;
    };

    const getSalesById = (id: string, intervalSales: SalesById<T>) => {
      let sales = intervalSales.get(id);
      if (!sales) {
        sales = { sales: [] };
        intervalSales.set(id, sales);
        return sales;
      }
      return sales;
    };

    for (const sale of sales) {
      for (const aggregationInterval of Object.values(AggregationInterval)) {
        const id = getIntervalAggregationId(sale.timestamp, aggregationInterval);
        const interval = getInterval(aggregationInterval, salesByInterval);
        const { sales } = getSalesById(id, interval);
        sales.push(sale);
      }
    }

    return salesByInterval;
  }

  private groupSalesByPeriod(sales: Iterable<T>): SalesByPeriod<T> {
    const salesByPeriod: SalesByPeriod<T> = new Map();

    const getInterval = (statsPeriod: StatsPeriod, salesByPeriod: Map<StatsPeriod, SalesById<T>>) => {
      let interval = salesByPeriod.get(statsPeriod);

      if (!interval) {
        interval = new Map();
        salesByPeriod.set(statsPeriod, interval);
        return interval;
      }
      return interval;
    };

    const getSalesById = (id: string, interval: SalesById<T>) => {
      let sales = interval.get(id);
      if (!sales) {
        sales = { sales: [] };
        interval.set(id, sales);
        return sales;
      }
      return sales;
    };

    for (const sale of sales) {
      for (const period of Object.values(StatsPeriod)) {
        const { docId } = getStatsDocInfo(sale.timestamp, period);
        const interval = getInterval(period, salesByPeriod);
        const { sales } = getSalesById(docId, interval);
        sales.push(sale);
      }
    }

    return salesByPeriod;
  }

  private groupSales(salesIterator: Iterable<T>): {
    salesByCollection: Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId }>;
    salesByNft: Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId; tokenId: string }>;
  } {
    const salesByCollection = new Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId }>();
    const salesByNft = new Map<string, { sales: T[]; collectionAddress: string; chainId: ChainId; tokenId: string }>();
    const getCollectionId = (sale: T) => {
      return `${sale.chainId}:${sale.collectionAddress}`;
    };

    const getNftId = (sale: T) => {
      return `${getCollectionId(sale)}:${sale.tokenId}`;
    };

    for (const sale of salesIterator) {
      const id = getCollectionId(sale);
      const item = salesByCollection.get(id) ?? {
        sales: [] as T[],
        collectionAddress: sale.collectionAddress,
        chainId: sale.chainId as ChainId
      };
      item.sales.push(sale);
      salesByCollection.set(id, item);

      const nftId = getNftId(sale);
      const nftItem = salesByNft.get(nftId) ?? {
        sales: [] as T[],
        collectionAddress: sale.collectionAddress,
        chainId: sale.chainId as ChainId,
        tokenId: sale.tokenId
      };
      nftItem.sales.push(sale);
      salesByNft.set(nftId, nftItem);
    }

    return { salesByCollection, salesByNft };
  }
}
