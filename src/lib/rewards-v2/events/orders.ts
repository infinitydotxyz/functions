
export interface OrderCreatedEvent {
  kind: "ORDER_CREATED",
  isSellOrder: boolean,
  orderId: string,
  ethBlockNumber: number,
  token: {
    address: string,
    tokenId: string,
  },
  floorPriceUSD: number,
  maker: string,
  expiresAt: number,
  priceUSD: number,
  timestamp: number,
  processed: boolean,
  chain: number,
}

export interface OrderCompletedEvent {
  kind: "ORDER_COMPLETED",
  isSellOrder: boolean,
  orderId: string,
  timestamp: number,
  processed: boolean,
  reason: "fulfilled" | "cancelled" | "expired",
  chain: number,
  maker: string,
}
