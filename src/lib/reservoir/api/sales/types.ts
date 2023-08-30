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

export interface ReservoirSales {
  sales: ReservoirSale[];
  continuation: string;
}
export interface ReservoirSale {
  chainId: string;
  id: string;
  saleId: string;
  orderId: string;
  orderSource: string;
  orderSide: string;
  orderKind: string;
  from: string; // seller
  to: string; // buyer
  fillSource: string;
  block: number;
  txHash: string;
  washTradingScore: number;
  amount: string;
  logIndex: number;
  batchIndex: number;
  timestamp: number; // seconds since epoch
  price: {
    currency: {
      contract: string;
      name: string;
      symbol: string;
      decimals: number;
    };
    amount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
    netAmount: {
      raw: string;
      decimal: number;
      usd: number;
      native: number;
    };
  };
  token: {
    contract: string;
    tokenId: string;
    name: string;
    image: string;
    collection: {
      id: string;
      name: string;
    };
  };
}

export interface FlattenedNFTSale {
  id: string;
  txhash: string;
  log_index: number;
  bundle_index: number;
  block_number: number;
  wash_trading_score: number;
  fill_source: string;
  marketplace: string;
  marketplace_address: string;
  seller: string;
  buyer: string;
  quantity: string;
  collection_address: string;
  collection_name: string;
  token_id: string;
  token_image: string;
  sale_timestamp: number;
  sale_price: string;
  sale_price_eth: number;
  sale_currency_address: string;
  sale_currency_decimals: number;
  sale_currency_symbol: string;
}
