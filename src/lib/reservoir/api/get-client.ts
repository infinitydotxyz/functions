import got, { Method } from 'got';
import { join, normalize } from 'path';
import qs from 'qs';

import { paths } from '@reservoir0x/reservoir-kit-client';

import { config } from '@/config/index';

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

const BASE_URL = config.reservoir.baseUrls;
export const chainIdToNetwork: Record<number, keyof typeof BASE_URL> = Object.fromEntries(
  (Object.entries(BASE_URL) as [keyof typeof BASE_URL, (typeof BASE_URL)[keyof typeof BASE_URL]][]).map(
    ([name, value]) => [value.chainId, name]
  )
);

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
