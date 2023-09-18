export interface SubMessage<Events extends string, Filters extends string> {
  type: 'subscribe';
  event: Events;
  filters?: Partial<Record<Filters, string | string[]>>;
  exclude?: Partial<Record<Filters, string | string[]>>;
}

export type AskEvents = 'ask.*' | 'ask.created' | 'ask.updated';
export type OrderFilters = 'contract' | 'source' | 'maker' | 'taker';
export type AskSubMessage = SubMessage<AskEvents, OrderFilters>;

export type BidEvents = 'bid.*' | 'bid.created' | 'bid.updated';
export type BidSubMessage = SubMessage<BidEvents, OrderFilters>;

export type SaleEvents = 'sale.*' | 'sale.created' | 'sale.updated' | 'sale.deleted';
export type SaleFilters = 'contract' | 'maker' | 'taker';
export type SaleSubMesasge = SubMessage<SaleEvents, SaleFilters>;

export type Subscriptions = AskSubMessage | BidSubMessage | SaleSubMesasge;
