import { ethers } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import { ChainId, OrderSource } from '@infinityxyz/lib/types/core';

import { getMarketplaceAddress } from '@/lib/utils/get-marketplace-address';

import { fetchSalesFromReservoir } from '../reservoir';
import { FlattenedNFTSale, SaleOptions } from './types';

export async function getReservoirSales(
  chainId: ChainId,
  _options: Partial<SaleOptions>
): Promise<{ data: Partial<FlattenedNFTSale>[]; continuation: string } | undefined> {
  const options: SaleOptions = {
    limit: 100,
    ..._options
  };

  const response = await fetchSalesFromReservoir(chainId, options);
  if (!response) {
    return undefined;
  }

  const sales = (response.sales ?? []).map((sale) => {
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
      washTradingScore: sale.washTradingScore,
      fill_source: sale.fillSource,
      marketplace: sale.orderSource,
      marketplace_address: getMarketplaceAddress(chainId, sale.orderKind as OrderSource),
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
    continuation: response.continuation
  };
}
