import { ReservoirClient } from '../get-client';
import { BidOrder, OrderStatus } from './types';

export interface BidOrderOptions {
  ids?: string[];
  token?: string;
  tokenSetId?: string;
  maker?: string;
  contracts?: string[];
  status?: OrderStatus;
  source?: string;
  native?: boolean;
  startTimestamp?: number;
  includeMetadata: boolean;
  includeRawData: boolean;
  sortBy?: 'createdAt' | 'price';
  continuation?: string;
  limit: number;
}

export async function getOrders(client: ReservoirClient, _options: Partial<BidOrderOptions>) {
  const options: BidOrderOptions = {
    includeMetadata: false,
    includeRawData: true,
    limit: 100,
    ..._options
  };

  const contracts = _options.contracts?.length ? { contracts: _options.contracts } : {};
  const ids = _options.ids?.length ? { ids: _options.ids } : {};
  const response = await client(
    '/orders/bids/v3',
    'get'
  )({
    query: {
      ...options,
      ...(contracts as any),
      ...(ids as any)
    }
  });

  const orders = response.data.orders as BidOrder[];

  return {
    data: {
      orders,
      continuation: response.data.continuation
    },
    statusCode: response.statusCode
  };
}
