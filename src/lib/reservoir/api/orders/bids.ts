import { ReservoirClient } from '../get-client';
import { BidOrder, OrderStatus } from './types';

export interface BidOrderOptions {
  ids?: string;
  token?: string;
  tokenSetId?: string;
  maker?: string;
  contracts?: string[];
  status?: OrderStatus;
  source?: string;
  native?: boolean;
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

  const response = await client(
    '/orders/bids/v3',
    'get'
  )({
    query: {
      ...options
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
