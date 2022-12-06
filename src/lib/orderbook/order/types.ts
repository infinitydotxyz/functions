import { ChainId, ChainOBOrder } from '@infinityxyz/lib/types/core';

import { Orderbook, Reservoir } from '../..';

export interface BaseRawOrder {
  id: string;
  chainId: ChainId;
  updatedAt: number;
  isSellOrder: boolean;
  createdAt: number;
}

export interface RawOrderWithoutError extends BaseRawOrder {
  source: Reservoir.Api.Orders.Types.OrderKind;
  rawOrder: any;
  infinityOrder: ChainOBOrder;
  gasUsage: string;
  isDynamic: boolean;
}

export interface OrderError {
  errorCode: Orderbook.Errors.ErrorCode;
  value: string;
  source: Reservoir.Api.Orders.Types.OrderKind | 'unknown';
  type: 'unsupported' | 'unexpected';
}

export interface RawOrderWithError extends BaseRawOrder {
  error: OrderError;
}

export type RawOrder = RawOrderWithError | RawOrderWithoutError;

/**
 * structure
 *
 * - ordersV2
 *   - {orderId} Stores the raw order data
 *     - orderStatusEvents
 *       - {eventId}
 * - ordersByChain
 *   - {chainId}
 *     - chainOrders
 *       - {orderId} Display data for the order
 */

export interface FirestoreOrder {
  id: string;
  chainId: ChainId;
}

// export interface FirestoreOrder {
//   metadata: {
//     id: string;
//     chainId: ChainId;
//     source: Reservoir.Api.Orders.Types.OrderKind;
//     updatedAt: number;
//     hasError: boolean;
//   };
//   error?: {
//     errorCode: Orderbook.Errors.ErrorCode;
//     value: string;
//     source: Reservoir.Api.Orders.Types.OrderKind | 'unknown';
//     type: 'unsupported' | 'unexpected';
//   };
//   data: {
//     isSellOrder: boolean;
//     rawOrder: any;
//     infinityOrder: ChainOBOrder;
//     gasUsage: string;
//     isDynamic: boolean;
//   };
//   status: {
//     status: Reservoir.Api.Orders.Types.OrderStatus;
//     /**
//      * the order is valid if it is active or inactive
//      */
//     isValid: boolean;
//     mostRecentEvent: {
//       id: string;
//       orderedId: number;
//       status: Reservoir.Api.Orders.Types.OrderStatus;
//     };
//   };
// }
