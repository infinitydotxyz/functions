import { ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';

export enum JsonRpcError {
  RateLimit = 429,
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000
}

export type EthersJsonRpcRequest<Response> = () => Promise<Response>;

export interface LogRequestOptions {
  fromBlock?: number;
  toBlock?: number;
}

export type LogRequest = (address: string, chainId: string, options?: LogRequestOptions) => ethers.providers.Log[];

export type ThunkedLogRequest = (fromBlock: number, toBlock: number) => Promise<ethers.providers.Log[]>;

export interface PaginateLogsOptions {
  fromBlock: number;
  toBlock?: number | 'latest';
  maxAttempts?: number;

  /**
   * stream return type should be used for getting events as fast as
   * possible and handling events as they are available
   *
   * generator should be used to lazily request events
   *
   * promise should be used to get all events at once
   */
  returnType?: 'stream' | 'generator' | 'promise';
}

export interface HistoricalLogsChunk {
  events: ethers.providers.Log[];
  fromBlock: number;
  toBlock: number;
  progress: number;
}
export type HistoricalLogs = Generator<Promise<HistoricalLogsChunk>, void, unknown>;

export interface HistoricalLogsOptions {
  fromBlock?: number;
  toBlock?: number | 'latest';
  returnType?: 'stream' | 'promise' | 'generator';
}

export interface BaseParams {
  chainId: ChainId;
  address: string;
  txHash: string;
  txIndex: number;
  block: number;
  blockHash: string;
  logIndex: number;
  batchIndex: number;
  blockTimestamp: number;
}

export enum ContractEventKind {
  PauseablePausedEvent = 'PAUSEABLE_PAUSE_EVENT',
  PauseableUnpausedEvent = 'PAUSEABLE_UNPAUSED_EVENT',
  OwnableOwnershipTransferredEvent = 'OWNABLE_OWNERSHIP_TRANSFERRED_EVENT',
  FlowExchangeETHWithdrawnEvent = 'FLOW_EXCHANGE_ETH_WITHDRAWN_EVENT',
  FlowExchangeERC20WithdrawnEvent = 'FLOW_EXCHANGE_ERC20_WITHDRAWN_EVENT',
  FlowExchangeMatchExecutorUpdated = 'FLOW_EXCHANGE_MATCH_EXECUTOR_UPDATED',
  FlowExchangeWethTransferGasUnitsUpdated = 'FLOW_EXCHANGE_WETH_TRANSFER_GAS_UNITS_UPDATED',
  FlowExchangeProtocolFeeUpdated = 'FLOW_EXCHANGE_PROTOCOL_FEE_UPDATED',
  FlowExchangeMatchOrderFulfilled = 'FLOW_EXCHANGE_MATCH_ORDER_FULFILLED',
  FlowExchangeTakeOrderFulfilled = 'FLOW_EXCHANGE_TAKE_ORDER_FULFILLED',
  FlowExchangeCancelAllOrders = 'FLOW_EXCHANGE_CANCEL_ALL_ORDERS',
  FlowExchangeCancelMultipleOrders = 'FLOW_EXCHANGE_CANCEL_MULTIPLE_ORDERS',
  CumulativeMerkleDistributorErc20Added = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ERC20_ADDED',
  CumulativeMerkleDistributorErc20Removed = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ERC20_REMOVED',
  CumulativeMerkleDistributorEthWithdrawn = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ETH_WITHDRAWN',
  CumulativeMerkleDistributorErc20Withdrawn = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ERC20_WITHDRAWN',
  CumulativeMerkleDistributorEthClaimed = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ETH_CLAIMED',
  CumulativeMerkleDistributorErc20Claimed = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ERC20_CLAIMED',
  CumulativeMerkleDistributorErc20MerkleRootUpdated = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ERC20_MERKLE_ROOT_UPDATED',
  CumulativeMerkleDistributorEthMerkleRootUpdated = 'CUMULATIVE_MERKLE_DISTRIBUTOR_ETH_MERKLE_ROOT_UPDATED',
  Erc721Transfer = 'ERC721_TRANSFER_EVENT',
  Erc721Approval = 'ERC721_APPROVAL_EVENT',
  Erc721ApprovalForAll = 'ERC721_APPROVAL_FOR_ALL_EVENT',
  Erc20Transfer = 'ERC20_TRANSFER_EVENT',
  Erc20Approval = 'ERC20_APPROVAL_EVENT'
}

export interface ContractEvent<T> {
  metadata: {
    eventId: string;
    eventKind: ContractEventKind;
    commitment: 'latest' | 'finalized';
    processed: boolean;
    reorged: boolean;
  };
  event: T;
  baseParams: BaseParams;
}
