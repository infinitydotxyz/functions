import { ethers } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import { ChainId, OrderSource } from '@infinityxyz/lib/types/core';

import { getMarketplaceAddress } from '@/lib/utils/get-marketplace-address';

import { ReservoirClient } from '../get-client';
import { FlattenedNFTSale } from './types';

export interface SaleOptions {
  contract?: string[];
  token?: string;
  includeTokenMetadata?: boolean;
  collection?: string;
  attributes?: string;
  txHash?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  limit: number;
  continuation?: string;
}

export async function getSales(client: ReservoirClient, _options: Partial<SaleOptions>) {
  const options: SaleOptions = {
    limit: 100,
    ..._options
  };

  const response = await client(
    '/sales/v4',
    'get'
  )({
    query: {
      ...options
    }
  });

  const sales = (response.data.sales ?? []).map((sale) => {
    const amount = sale.price?.amount ?? sale.price?.netAmount;

    if (!amount) {
      console.error(`Failed to find price data for sale ${sale.id}`);
    }

    const saleData: Partial<FlattenedNFTSale> = {
      id: sale.id,
      txhash: sale.txHash,
      log_index: sale.logIndex,
      bundle_index: sale.batchIndex,
      block_number: sale.block,
      marketplace: sale.orderKind,
      marketplace_address: getMarketplaceAddress(response.chainId as ChainId, sale.orderKind as OrderSource),
      seller: sale.from,
      buyer: sale.to,
      quantity: sale.amount,
      collection_address: sale.token?.contract,
      collection_name: sale.token?.collection?.name,
      token_id: sale.token?.tokenId,
      token_image: sale.token?.image,
      sale_timestamp: (sale.timestamp ?? 0) * 1000,
      sale_price: amount?.raw,
      sale_price_eth: parseFloat(formatUnits(amount?.raw ?? '0', sale?.price?.currency?.decimals)),
      sale_currency_address: sale?.price?.currency?.contract ?? ethers.constants.AddressZero,
      sale_currency_decimals: sale?.price?.currency?.decimals,
      sale_currency_symbol: sale?.price?.currency?.symbol
    };

    return saleData;
  });

  return {
    data: sales,
    continuation: response.data.continuation
  };
}
