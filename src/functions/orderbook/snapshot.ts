import { join, normalize } from 'path';
import phin from 'phin';

import { ChainId, ChainOBOrder, OrderSource } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';

export interface SnapshotMetadata {
  bucket: string;
  file: string;
  chainId: ChainId;
  numOrders: number;
  timestamp: number;
}

export interface OrderbookSnapshotOrder {
  id: string;
  order: ChainOBOrder;
  source: OrderSource;
  sourceOrder: unknown;
  gasUsage: string;
}

export async function takeSnapshot(chainId: ChainId) {
  const baseUrl = config.flow.baseUrl;
  if (!baseUrl) {
    console.warn('No baseUrl configured, skipping snapshot');
    return;
  }

  const endpoint = new URL(normalize(join(baseUrl, 'v2/bulk/snapshot'))).toString();

  const res = await phin({
    url: endpoint,
    method: 'PUT',
    data: {
      chainId
    },
    headers: {
      'x-api-key': config.flow.apiKey
    }
  });

  if (res.statusCode && res.statusCode < 300 && res.statusCode >= 200) {
    console.log('Successfully triggered snapshot');
    return;
  }
  throw new Error(`Failed to take snapshot: ${res.statusCode} ${res.statusMessage}`);
}
