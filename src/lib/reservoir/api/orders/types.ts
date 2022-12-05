import { definitions } from '@reservoir0x/reservoir-kit-client';

export type OrderStatus = 'active' | 'inactive' | 'expired' | 'cancelled' | 'filled';
export type OrderKind =
  | 'wyvern-v2'
  | 'wyvern-v2.3'
  | 'looks-rare'
  | 'zeroex-v4-erc721'
  | 'zeroex-v4-erc1155'
  | 'foundation'
  | 'x2y2'
  | 'seaport'
  | 'rarible'
  | 'element-erc721'
  | 'element-erc1155'
  | 'quixotic'
  | 'nouns'
  | 'zora-v3'
  | 'mint'
  | 'cryptopunks'
  | 'sudoswap'
  | 'universe'
  | 'nftx'
  | 'blur'
  | 'infinity'
  | 'forward';

export interface BaseOrder {
  id: string;
  kind: OrderKind;
  side: 'buy' | 'sell';
  tokenSetId: string;
  tokenSetSchemaHash: string;
  contract?: string;
  maker: string;
  taker: string;
  price?: definitions['price'];
  validFrom: number;
  validUntil: number;
  quantityFilled?: number;
  quantityRemaining?: number;
  metadata?: definitions['Model103'];
  status: OrderStatus;
  source?: definitions['source'];
  feeBps?: number;
  feeBreakdown?: definitions['Model105'];
  expiration: number;
  isReservoir?: boolean;
  createdAt: string;
  updatedAt: string;
  rawData?: definitions['source'];
}

export interface AskOrder extends BaseOrder {
  isDynamic?: boolean;
}
export type BidOrder = BaseOrder;

export type Order = AskOrder | BidOrder;
