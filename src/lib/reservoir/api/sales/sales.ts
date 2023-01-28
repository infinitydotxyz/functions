import { constants, ethers } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import { OrderSource } from '@infinityxyz/lib/types/core';
import * as Sdk from '@reservoir0x/sdk';

import { ReservoirClient } from '../get-client';
import { FlattenedPostgresNFTSaleWithId } from './types';

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

  const chainIdInt = parseInt(response.chainId, 10);
  const getMarketplaceAddress = (orderKind?: OrderSource) => {
    switch (orderKind) {
      case 'blur':
        return Sdk.Blur.Addresses.Exchange[chainIdInt];
      case 'cryptopunks':
        return Sdk.CryptoPunks.Addresses.Exchange[chainIdInt];
      case 'element-erc1155':
      case 'element-erc721':
        return Sdk.Element.Addresses.Exchange[chainIdInt];

      case 'flow':
        return Sdk.Flow.Addresses.Exchange[chainIdInt];

      case 'forward':
        return Sdk.Forward.Addresses.Exchange[chainIdInt];

      case 'foundation':
        return Sdk.Foundation.Addresses.Exchange[chainIdInt];

      case 'infinity':
        return Sdk.Infinity.Addresses.Exchange[chainIdInt];

      case 'looks-rare':
        return Sdk.LooksRare.Addresses.Exchange[chainIdInt];

      case 'manifold':
        return Sdk.Manifold.Addresses.Exchange[chainIdInt];

      case 'mint':
        return constants.AddressZero;

      case 'nftx':
        return Sdk.Nftx.Addresses.MarketplaceZap[chainIdInt];

      case 'nouns':
        return Sdk.Nouns.Addresses.AuctionHouse[chainIdInt];

      case 'quixotic':
        return Sdk.Quixotic.Addresses.Exchange[chainIdInt];

      case 'rarible':
        return Sdk.Rarible.Addresses.Exchange[chainIdInt];

      case 'seaport':
        return Sdk.Seaport.Addresses.Exchange[chainIdInt];

      case 'sudoswap':
        return Sdk.Sudoswap.Addresses.PairFactory[chainIdInt];

      case 'universe':
        return Sdk.Universe.Addresses.Exchange[chainIdInt];

      case 'wyvern-v2':
        return Sdk.WyvernV2.Addresses.Exchange[chainIdInt];
      case 'wyvern-v2.3':
        return Sdk.WyvernV23.Addresses.Exchange[chainIdInt];
      case 'x2y2':
        return Sdk.X2Y2.Addresses.Exchange[chainIdInt];
      case 'zeroex-v4-erc1155':
        return Sdk.ZeroExV4.Addresses.Exchange[chainIdInt];
      case 'zeroex-v4-erc721':
        return Sdk.ZeroExV4.Addresses.Exchange[chainIdInt];
      case 'zora-v3':
        return Sdk.Zora.Addresses.Exchange[chainIdInt];

      default:
        console.warn(`Unknown source: ${orderKind}`);
        return constants.AddressZero;
    }
  };

  const sales = (response.data.sales ?? []).map((sale) => {
    const pgSale: Partial<FlattenedPostgresNFTSaleWithId> = {
      id: sale.id,
      txhash: sale.txHash,
      log_index: sale.logIndex,
      bundle_index: sale.batchIndex,
      block_number: sale.block,
      marketplace: sale.orderKind,
      marketplace_address: getMarketplaceAddress(sale.orderKind as OrderSource),
      seller: sale.from,
      buyer: sale.to,
      quantity: sale.amount,
      collection_address: sale.token?.contract,
      collection_name: sale.token?.collection?.name,
      token_id: sale.token?.tokenId,
      token_image: sale.token?.image,
      sale_timestamp: (sale.timestamp ?? 0) * 1000,
      sale_price: sale?.price?.netAmount?.raw,
      sale_price_eth: parseFloat(formatUnits(sale?.price?.netAmount?.raw ?? '0', sale?.price?.currency?.decimals)),
      sale_currency_address: sale?.price?.currency?.contract ?? ethers.constants.AddressZero,
      sale_currency_decimals: sale?.price?.currency?.decimals,
      sale_currency_symbol: sale?.price?.currency?.symbol
    };

    return pgSale;
  });

  return {
    data: sales,
    continuation: response.data.continuation
  };
}
