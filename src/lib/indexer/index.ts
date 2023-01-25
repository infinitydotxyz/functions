import axios from 'axios';
import QuickLRU from 'quick-lru';

import { ONE_HOUR } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';

const INDEXER_URL = `https://nft-collection-service-dot-nftc-infinity.ue.r.appspot.com/collection`;

export enum ResponseType {
  IndexingInitiated = 'INDEXING_INITIATED',
  AlreadyQueued = 'INDEXING_ALREADY_INITIATED',
  BadRequest = 'BAD_REQUEST',
  ServerError = 'SERVER_ERROR',
  UnknownError = 'UNKNOWN_ERROR'
}

function getResponseType(status: number): ResponseType {
  switch (status) {
    case 202:
      return ResponseType.IndexingInitiated;
    case 200:
      return ResponseType.AlreadyQueued;
    case 400:
      return ResponseType.BadRequest;
    case 500:
      return ResponseType.ServerError;
    default:
      return ResponseType.UnknownError;
  }
}

const cache = new QuickLRU({ maxSize: 100 });

export async function enqueueCollection(collection: {
  chainId: string;
  address: string;
  indexInitiator?: string;
  reset?: boolean;
}): Promise<void> {
  if (config.isDev) {
    return;
  }
  try {
    if (!collection.reset && (cache.get(`${collection.chainId}:${collection.address}`) ?? 0) < Date.now() - ONE_HOUR) {
      return;
    }
    cache.set(`${collection.chainId}:${collection.address}`, Date.now());

    const res = await axios.post(
      INDEXER_URL,
      {
        chainId: collection.chainId,
        address: collection.address,
        indexInitiator: collection.indexInitiator,
        reset: collection.reset ?? false
      },
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    // const response = getResponseType(res.status);
    getResponseType(res.status);
    console.log('enqueueCollection', collection.address, res.status);

    // return response;
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status && typeof err.response.status === 'number') {
        getResponseType(err.response.status);
        // const response = getResponseType(err.response.status);
        // return response;
      } else {
        throw err;
      }
    }
    throw err;
  }
}
