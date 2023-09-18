import got, { Method } from 'got';
import { join, normalize } from 'path';
import qs from 'qs';

import { paths } from '@reservoir0x/reservoir-kit-client';

export type Paths = keyof paths;
export type Methods<P extends Paths> = keyof paths[P];
export type Request<P extends Paths, M extends Methods<P>> = paths[P][M];
export type Parameters<P extends Paths, M extends Methods<P>> = Request<P, M> extends { parameters: unknown }
  ? Request<P, M>['parameters']
  : never;
export type ResponseByStatusCode<P extends Paths, M extends Methods<P>> = Request<P, M> extends { responses: unknown }
  ? Request<P, M>['responses']
  : never;
export type StatusCodes<P extends Paths, M extends Methods<P>> = keyof ResponseByStatusCode<P, M>;
export type StatusCodeResponse<
  P extends Paths,
  M extends Methods<P>,
  S extends StatusCodes<P, M>
> = ResponseByStatusCode<P, M>[S] extends { schema: unknown } ? ResponseByStatusCode<P, M>[S]['schema'] : never;

export type Response<
  P extends Paths,
  M extends Methods<P>,
  K extends StatusCodes<P, M> = keyof ResponseByStatusCode<P, M>
> = StatusCodeResponse<P, M, K>;

const BASE_URL = {
  Ethereum: {
    api: 'https://api.reservoir.tools/',
    ws: 'wss://ws.reservoir.tools/'
  },
  Goerli: {
    api: 'https://api-goerli.reservoir.tools/',
    ws: 'wss://ws-goerli.reservoir.tools/'
  },
  Sepolia: {
    api: 'https://api-sepolia.reservoir.tools',
    ws: 'wss://ws-sepolia.reservoir.tools/'
  },
  Polygon: {
    api: 'https://api-polygon.reservoir.tools/',
    ws: 'wss://ws-polygon.reservoir.tools/'
  },
  Mumbai: {
    api: 'https://api-mumbai.reservoir.tools/',
    ws: 'wss://ws-mumbai.reservoir.tools/'
  },
  BNB: {
    api: 'https://api-bsc.reservoir.tools/',
    ws: 'wss://ws-bsc.reservoir.tools/'
  },
  Arbitrum: {
    api: 'https://api-arbitrum.reservoir.tools/',
    ws: 'wss://ws-arbitrum.reservoir.tools/'
  },
  Optimism: {
    api: 'https://api-optimism.reservoir.tools/',
    ws: 'wss://ws-optimism.reservoir.tools/'
  },
  ArbitrumNova: {
    api: 'https://api-arbitrum-nova.reservoir.tools/',
    ws: 'wss://ws-arbitrum-nova.reservoir.tools/'
  },
  Base: {
    api: 'https://api-base.reservoir.tools/',
    ws: 'wss://ws-base.reservoir.tools/'
  },
  BaseGoerli: {
    api: 'https://api-base-goerli.reservoir.tools/',
    ws: 'wss://ws-base-goerli.reservoir.tools/'
  },
  Zora: {
    api: 'https://api-zora.reservoir.tools/',
    ws: 'wss://ws-zora.reservoir.tools/'
  },
  ZoraGoerli: {
    api: 'https://api-zora-testnet.reservoir.tools/',
    ws: 'wss://ws-zora-testnet.reservoir.tools/'
  },
  ScrollAlpha: {
    api: 'https://api-scroll-alpha.reservoir.tools/',
    ws: 'wss://ws-scroll-alpha.reservoir.tools/'
  },
  Linea: {
    api: 'https://api-linea.reservoir.tools/',
    ws: 'wss://ws-linea.reservoir.tools/'
  }
};

export const chainIdToNetwork: Record<number, keyof typeof BASE_URL> = {
  1: 'Ethereum',
  5: 'Goerli',
  6: 'Sepolia',
  137: 'Polygon',
  80001: 'Mumbai',
  56: 'BNB',
  42161: 'Arbitrum',
  42170: 'ArbitrumNova',
  8453: 'Base',
  84531: 'BaseGoerli',
  7777777: 'Zora',
  999: 'ZoraGoerli',
  534353: 'ScrollAlpha',
  59144: 'Linea'
};

const getBaseUrl = (chainId: number | string) => {
  chainId = typeof chainId === 'string' ? parseInt(chainId) : chainId;
  const networkName = chainIdToNetwork[chainId];
  if (!networkName) {
    return null;
  }
  return BASE_URL[networkName] || null;
};

export type ReservoirClient = <P extends Paths, M extends Methods<P>>(
  endpoint: P,
  method: M
) => (params: Parameters<P, M>) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M>; chainId: string }>;

export const getClientUrl = (chainId: string) => {
  const network = chainIdToNetwork[parseInt(chainId, 10)];
  const baseUrl = BASE_URL[network];
  if (!baseUrl) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  return {
    api: new URL(baseUrl.api),
    ws: new URL(baseUrl.ws)
  };
};

export const getClient = (chainId: string, apiKey: string): ReservoirClient => {
  const baseUrl = getClientUrl(chainId).api.toString();

  return <P extends Paths, M extends Methods<P>>(
    endpoint: P,
    method: M
  ): ((
    params: Parameters<P, M>
  ) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M>; chainId: string }>) => {
    const _url = normalize(join(baseUrl, endpoint));
    const url = new URL(_url);

    const execute: (
      params: Parameters<P, M>
    ) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M>; chainId: string }> = async (params) => {
      const response = await got(url.toString(), {
        method: method as Method,
        headers: {
          'x-api-key': apiKey
        },
        searchParams: qs.stringify(
          typeof params === 'object' && params && 'query' in params && params.query ? params.query : {},
          { arrayFormat: 'repeat' }
        ),
        throwHttpErrors: false,
        timeout: 20_000
      });
      const statusCode = response.statusCode as StatusCodes<P, M>;
      if (response.statusCode != null && response.statusCode > 299) {
        throw new Error(`Request failed with status code ${response.statusCode} ${response.body}`);
      }

      if (response.body) {
        const body = JSON.parse(response.body.toString());
        return { data: body, statusCode, chainId };
      }

      return { data: null as any, statusCode, chainId };
    };

    return execute;
  };
};
