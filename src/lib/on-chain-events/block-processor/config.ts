import { ERC20ABI, ERC721ABI, FlowExchangeABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';

import { Erc20ApprovalEvent } from '../erc20/erc20-approval';
import { Erc20TransferEvent } from '../erc20/erc20-transfer';
import { Erc721ApprovalEvent } from '../erc721/erc721-approval';
import { Erc721ApprovalForAllEvent } from '../erc721/erc721-approval-for-all';
import { Erc721TransferEvent } from '../erc721/erc721-transfer';
import { CancelAllOrdersEvent } from '../flow-exchange/cancel-all-orders';
import { CancelMultipleOrdersEvent } from '../flow-exchange/cancel-multiple-orders';
import { ERC20WithdrawnEvent } from '../flow-exchange/erc20-withdrawn';
import { ETHWithdrawnEvent } from '../flow-exchange/eth-withdrawn';
import { MatchExecutorUpdatedEvent } from '../flow-exchange/match-executor-updated';
import { MatchOrderFulfilledEvent } from '../flow-exchange/match-order-fulfilled';
import { ProtocolFeeUpdatedEvent } from '../flow-exchange/protocol-fee-updated';
import { TakeOrderFulfilledEvent } from '../flow-exchange/take-order-fulfilled';
import { WethTransferGasUnitsUpdated } from '../flow-exchange/weth-transfer-gas-units-updated';
import { OwnershipTransferredEvent } from '../ownable/ownership-transferred';
import { PausedEvent } from '../pauseable/paused-event';
import { UnpausedEvent } from '../pauseable/unpaused-event';

/**
 * The version can be incremented to reset cursor values
 */
const version = 2;

export const blockProcessorConfig = {
  erc20: {
    id: (chainId: ChainId, address: string) =>
      `block-processor:chain:${chainId}:type:erc20:address:${address}:version:${version}`,
    events: [Erc20TransferEvent, Erc20ApprovalEvent],
    abi: ERC20ABI,
    startBlockNumberByChain: {
      [ChainId.Mainnet]: 16869618,
      [ChainId.Goerli]: 8688093,
      [ChainId.Polygon]: 0 // TODO-future
    }
  },
  erc721: {
    id: (chainId: ChainId, address: string) =>
      `block-processor:chain:${chainId}:type:erc721:address:${address}:version:${version}`,
    events: [Erc721TransferEvent, Erc721ApprovalEvent, Erc721ApprovalForAllEvent],
    abi: ERC721ABI,
    startBlockNumberByChain: {
      [ChainId.Mainnet]: 16869618,
      [ChainId.Goerli]: 8688093,
      [ChainId.Polygon]: 0 // TODO-future
    }
  },
  flowExchange: {
    id: (chainId: ChainId, address: string) =>
      `block-processor:chain:${chainId}:type:flow-exchange:address:${address}:version:${version}`,
    events: [
      CancelAllOrdersEvent,
      CancelMultipleOrdersEvent,
      ERC20WithdrawnEvent,
      ETHWithdrawnEvent,
      MatchExecutorUpdatedEvent,
      MatchOrderFulfilledEvent,
      ProtocolFeeUpdatedEvent,
      TakeOrderFulfilledEvent,
      WethTransferGasUnitsUpdated,
      OwnershipTransferredEvent,
      PausedEvent,
      UnpausedEvent
    ],
    abi: FlowExchangeABI,
    startBlockNumberByChain: {
      [ChainId.Mainnet]: 16471202,
      [ChainId.Goerli]: 8329378,
      [ChainId.Polygon]: 0 // TODO-future
    }
  }
} as const;
