import { ChainId } from '@infinityxyz/lib/types/core';
import { paths } from '@reservoir0x/reservoir-kit-client';
import { join, normalize } from 'path';
import got, { Method } from 'got';
import { config } from '../../utils/config';

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

export type ReservoirClient = <P extends Paths, M extends Methods<P>>(
  endpoint: P,
  method: M
) => (params: Parameters<P, M>) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M> }>;

export const getClient = (chainId: ChainId, apiKey: string): ReservoirClient => {
  const baseUrl = config.reservoirBaseUrls[chainId];

  if (!baseUrl) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  return <P extends Paths, M extends Methods<P>>(
    endpoint: P,
    method: M
  ): ((params: Parameters<P, M>) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M> }>) => {
    const _url = normalize(join(baseUrl, endpoint));
    const url = new URL(_url);

    const execute: (
      params: Parameters<P, M>
    ) => Promise<{ data: Response<P, M>; statusCode: StatusCodes<P, M> }> = async (params) => {
      const response = await got(url.toString(), {
        method: method as Method,
        headers: {
          'x-api-key': apiKey
        },
        searchParams: (params as any)?.query ?? {}
      });
      const statusCode = response.statusCode as StatusCodes<P, M>;
      if (response.statusCode != null && response.statusCode > 299) {
        throw new Error(`Request failed with status code ${response.statusCode}`);
      }

      if (response.body) {
        const body = JSON.parse(response.body.toString()) as paths[P][M] extends { responses: unknown }
          ? paths[P][M]['responses']
          : never;
        return { data: body, statusCode };
      }

      return { data: null as any, statusCode };
    };

    return execute;
  };
};
