import got, { Got, Response } from 'got/dist/source';

import { sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';

import { getClientUrl } from './get-client';
import { gotErrorHandler } from './got';
import { ReservoirSales, SaleOptions } from './sales/types';

const reservoirClients: { [chainId: string]: Got } = {};

function getReservoirClient(chainId: string) {
  if (reservoirClients[chainId]) {
    return reservoirClients[chainId];
  }

  const baseUrl = getClientUrl(chainId).api;

  const apiKey = config.reservoir.apiKey;
  const client = got.extend({
    prefixUrl: baseUrl,
    hooks: {
      beforeRequest: [
        (options) => {
          if (!options?.headers?.['x-api-key']) {
            if (!options.headers) {
              options.headers = {};
            }
            options.headers['x-api-key'] = apiKey;
          }
        }
      ]
    },
    /**
     * requires us to check status code
     */
    throwHttpErrors: false,
    cache: false,
    timeout: 20_000
  });

  reservoirClients[chainId] = client;

  return client;
}

export async function fetchSalesFromReservoir(chainId: string, options: Partial<SaleOptions>) {
  try {
    const client = getReservoirClient(chainId);

    const res: Response<ReservoirSales> = await errorHandler(() => {
      const searchParams: any = {
        limit: options.limit ?? 100
      };

      if (options.collection) {
        searchParams.collection = options.collection;
      }

      if (options.startTimestamp) {
        searchParams.startTimestamp = options.startTimestamp;
      }

      if (options.continuation) {
        searchParams.continuation = options.continuation;
      }

      const endpoint = 'sales/v6';

      return client.get(endpoint, {
        searchParams,
        responseType: 'json'
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const response = res.body;
    return response;
  } catch (e) {
    console.error('failed to get sales from reservoir', chainId, e);
  }
}

async function errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
  let attempt = 0;

  for (;;) {
    attempt += 1;

    try {
      const res: Response<T> = await request();

      switch (res.statusCode) {
        case 200:
          return res;

        case 400:
          throw new Error(res.statusMessage);

        case 404:
          throw new Error('Not found');

        case 429:
          await sleep(2000);
          throw new Error('Rate limited');

        case 500:
          throw new Error('Internal server error');

        case 504:
          await sleep(5000);
          throw new Error('Reservoir down');

        default:
          await sleep(2000);
          throw new Error(`Unknown status code: ${res.statusCode}`);
      }
    } catch (err) {
      const handlerRes = gotErrorHandler(err);
      if ('retry' in handlerRes) {
        await sleep(handlerRes.delay);
      } else if (!handlerRes.fatal) {
        // unknown error
        if (attempt >= maxAttempts) {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
}
