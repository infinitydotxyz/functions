import { ReservoirClient } from '../get-client';
import { AskEventV3 } from './types';

export interface AskEventOptions {
  contract?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  sortDirection: 'desc' | 'asc';
  continuation?: string;
  limit: number;
  normalizeRoyalties: boolean;
}

export async function getEvents(client: ReservoirClient, _options: Partial<AskEventOptions>) {
  const options: AskEventOptions = {
    sortDirection: 'desc',
    limit: 100, // max is 1000
    normalizeRoyalties: false,
    ..._options
  };

  const response = await client(
    '/events/asks/v3',
    'get'
  )({
    query: {
      ...options
    }
  });

  const askEvents = response.data.events as unknown as AskEventV3[];

  return {
    data: {
      events: askEvents,
      continuation: response.data.continuation
    },
    statusCode: response.statusCode
  };
}
