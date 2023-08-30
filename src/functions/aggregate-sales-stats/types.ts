import { ChainId } from '@infinityxyz/lib/types/core';

export interface NftSaleEventV2 {
  data: {
    chainId: ChainId;
    txHash: string;
    logIndex: number;
    bundleIndex: number;
    blockNumber: number;
    fillSource: string;
    washTradingScore: number;
    marketplace: string;
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
