import { ChainId } from '@infinityxyz/lib/types/core';
import * as Reservoir from '../../reservoir';

export type SyncMetadataType = 'ask' | 'bid';

export interface SyncMetadata {
  metadata: {
    type: SyncMetadataType;
    chainId: ChainId;
    updatedAt: number;
    isPaused: boolean;
  };
  data: {
    eventsProcessed: number;
    continuation: string;
  };
}

export type FirestoreOrderEvent = {
  metadata: {
    id: string;
    isSellOrder: boolean;
    updatedAt: number;
    processed: boolean;
    chainId: ChainId;
    migrationId: 1;
    orderId: string;
    status: Reservoir.Api.Orders.Types.OrderStatus;
  };
  data: {
    event: Reservoir.Api.Events.Types.ReservoirEventMetadata;
    order: Reservoir.Api.Events.Types.BidV1Order | Reservoir.Api.Events.Types.AskV2Order;
  };
};
