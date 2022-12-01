import { ReservoirClient } from '../get-client';
import { AskOrder, OrderStatus } from './types';

export interface AskOrderOptions {
  ids?: string;
  token?: string;
  maker?: string;
  community?: string;
  contracts?: string[];
  status?: OrderStatus;
  source?: string;
  native?: boolean;
  includePrivate: boolean;
  includeMetadata: boolean;
  includeRawData: boolean;
  normalizeRoyalties: boolean;
  sortBy?: 'createdAt' | 'price';
  continuation?: string;
  limit: number;
}

export async function getOrders(client: ReservoirClient, _options: Partial<AskOrderOptions>) {
  const options: AskOrderOptions = {
    includePrivate: true,
    includeMetadata: false,
    includeRawData: true,
    normalizeRoyalties: false,
    limit: 100,
    ..._options
  };

  const response = await client(
    '/orders/asks/v3',
    'get'
  )({
    query: {
      ...options
    }
  });

  const orders = response.data.orders as AskOrder[];

  return {
    data: {
      orders,
      continuation: response.data.continuation
    },
    statusCode: response.statusCode
  };
}
