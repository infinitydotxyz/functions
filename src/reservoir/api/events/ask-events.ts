import { ReservoirClient } from "../get-client";
import { AskV2Order, ReservoirEventMetadata } from "./types";

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
    '/events/asks/v2',
    'get'
  )({
    query: {
      ...options
    }
  });

  const askEvents = response.data.events as { order: AskV2Order; event: ReservoirEventMetadata }[];

  return {
    data: {
      events: askEvents,
      continuation: response.data.continuation
    },
    statusCode: response.statusCode
  };
}
