import { ReservoirClient } from '../get-client';
import { AskOrder, OrderStatus } from './types';

export interface AskOrderOptions {
  ids?: string[];
  token?: string;
  maker?: string;
  community?: string;
  contracts?: string[];
  status?: OrderStatus;
  source?: string;
  native?: boolean;
  includePrivate: boolean;
  includeCriteriaMetadata: boolean;
  includeRawData: boolean;
  normalizeRoyalties: boolean;
  sortBy?: 'createdAt' | 'price';
  continuation?: string;
  limit: number;
}

export async function getOrders(
  client: ReservoirClient,
  _options: Partial<AskOrderOptions>
): Promise<{
  data: {
    orders: AskOrder[];
    continuation: string | undefined;
  };
  statusCode: number;
}> {
  const contracts = _options.contracts?.length ? { contracts: _options.contracts } : {};
  const ids = _options.ids?.length ? { ids: _options.ids } : {};
  const options: Omit<AskOrderOptions, 'ids'> & { ids: string } = {
    includePrivate: false,
    includeCriteriaMetadata: false,
    includeRawData: true,
    normalizeRoyalties: false,
    limit: 100,
    ..._options,
    ...(contracts as any),
    ...(ids as any)
  };

  const response = await client(
    '/orders/asks/v4',
    'get'
  )({
    query: options
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
