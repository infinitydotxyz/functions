import { ReservoirClient } from '../get-client';
import { BidEventV3 } from './types';

export interface BidEventOptions {
  contract?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  includeCriteria: boolean;
  sortDirection: 'desc' | 'asc';
  continuation?: string;
  limit: number;
}

export async function getEvents(client: ReservoirClient, _options: Partial<BidEventOptions>) {
  const options: BidEventOptions = {
    sortDirection: 'desc',
    limit: 100, // max is 1000
    includeCriteria: true,
    ..._options
  };

  const response = await client(
    '/events/bids/v3' as '/events/bids/v2',
    'get'
  )({
    query: options
  });

  const bidEvents = response.data.events as unknown as BidEventV3[];

  return {
    data: {
      events: bidEvents,
      continuation: response.data.continuation
    },
    statusCode: response.statusCode
  };
}
