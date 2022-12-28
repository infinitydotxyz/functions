import { ChainId } from '@infinityxyz/lib/types/core';

import { ErrorCode } from '@/lib/orderbook/errors';

import * as Reservoir from '..';

export type SyncMetadataType = 'ask' | 'bid' | 'collection-ask' | 'collection-bid';

export interface SyncMetadata {
  metadata: {
    type: SyncMetadataType;
    chainId: ChainId;
    updatedAt: number;
    isPaused: boolean;
    collection?: string;
  };
  data: {
    eventsProcessed: number;
    continuation: string;
    minTimestampMs?: number;
  };
}

export type ReservoirOrderEvent = {
  metadata: {
    id: string;
    isSellOrder: boolean;
    updatedAt: number;
    processed: boolean;
    chainId: ChainId;
    migrationId: 1;
    orderId: string;
    status: Reservoir.Api.Orders.Types.OrderStatus;
    hasError?: boolean;
  };
  data: {
    event: Reservoir.Api.Events.Types.ReservoirEventMetadata;
    order: Reservoir.Api.Events.Types.BidV1Order | Reservoir.Api.Events.Types.AskV2Order;
  };
  error?: {
    errorCode: ErrorCode;
    value: string;
    source: string;
    reason: string;
    type: string;
  };
};
