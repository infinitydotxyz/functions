export interface OrderInactiveEvent {
  kind: 'ORDER_INACTIVE';
  status: 'inactive' | 'expired' | 'cancelled' | 'filled';
  isListing: boolean;
  id: number;
  orderId: string;
  blockNumber: number;
  timestamp: number;
  processed: boolean;
  priceUsd: number;
  expiresAt: number;
  collection: string;
  chainId: string;
  floorPriceUsd: number;
  maker: string;
  isCollectionBid: boolean;
}

export interface OrderActiveEvent {
  kind: 'ORDER_ACTIVE';
  status: 'active';
  isListing: boolean;
  id: number;
  orderId: string;
  expiresAt: number;
  blockNumber: number;
  timestamp: number;
  processed: boolean;
  priceUsd: number;
  collection: string;
  chainId: string;
  floorPriceUsd: number;
  maker: string;
  isCollectionBid: boolean;
}

export interface UpdateOrderRewardsEvent {
  kind: 'UPDATE_ORDER_REWARDS';
  id: number; // set to the order id of the most recent event + 1
  mostRecentEventId: number;
  orderId: string;
  timestamp: number;
  processed: boolean;
}

export type OrderEvents = OrderActiveEvent | OrderInactiveEvent | UpdateOrderRewardsEvent;

export interface OrderRewardEvent {
  kind: 'ORDER_REWARD';
  id: number;
  orderId: string;
  chainId: string;
  collection: string;
  user: string;
  start: {
    priceUsd: number;
    blockNumber: number;
    timestamp: number;
    floorPriceUsd: number;
  };
  end: {
    priceUsd: number;
    blockNumber: number;
    timestamp: number;
    floorPriceUsd: number;
  };
  processed: boolean;
  timestamp: number;
}

export interface OrderSnap {
  id: string;
  chainId: string;
  isListing: boolean;
  expiresAt: number;
  isCancelled: boolean;
  isBelowFloor: boolean;
  isNearFloor: boolean;
  isActive: boolean;
  priceUsd: number;
  maker: string;
  collection: string;
  lastRewardTimestamp: number;
  isFillable: boolean;
  eligibleForRewards: boolean;
  mostRecentEvent: OrderActiveEvent | OrderInactiveEvent;
  status: OrderInactiveEvent['status'] | OrderActiveEvent['status'];
}

// new orders are assumed to be active
export interface OrderStatEvent {
  kind: 'NEW_ORDER' | 'ORDER_ACTIVE' | 'ORDER_INACTIVE' | 'ORDER_CANCELLED';
  isActive: boolean;
  wasActive: boolean;
  chainId: string;
  user: string;
  id: number;
  orderId: string;
  isListing: boolean;
  wasBelowFloor: boolean;
  isBelowFloor: boolean;
  wasNearFloor: boolean;
  isNearFloor: boolean;
  wasCancelled: boolean;
  isCollectionBid: boolean;
  timestamp: number;
  processed: boolean;
}
