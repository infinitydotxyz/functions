import {FirestoreOrderItem, OrderItemSnippet, Token} from "@infinityxyz/lib/types/core";

export function getRelevantOrderItemSnippet(
    orderItem: FirestoreOrderItem,
    nft: Partial<Token>
): OrderItemSnippet | null {
  const isListing = orderItem.isSellOrder;
  if (isListing) {
    return nft.ordersSnippet?.listing ?? null;
  } else {
    return nft.ordersSnippet?.offer ?? null;
  }
}