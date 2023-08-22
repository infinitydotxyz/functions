export interface SaleEvent {
  kind: 'SALE';
  isListingNative: boolean;
  buyer: string;
  seller: string;
  chain: number;
  priceUSD: number;
  timestamp: number;
  processed: boolean;
}
