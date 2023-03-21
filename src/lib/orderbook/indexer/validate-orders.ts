import {
  ChainId,
  OrderApprovalChangeEvent,
  OrderBalanceChangeEvent,
  OrderEventKind,
  OrderEventMetadata,
  OrderStatus,
  OrderTokenOwnerUpdate,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';
import { UserProfileDto } from '@infinityxyz/lib/types/dto';
import { Common, Flow } from '@reservoir0x/sdk';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { Query } from '@/firestore/types';
import { logger } from '@/lib/logger';
import { Erc20ApprovalEventData } from '@/lib/on-chain-events/erc20/erc20-approval';
import { Erc20TransferEventData } from '@/lib/on-chain-events/erc20/erc20-transfer';
import { Erc721ApprovalEventData } from '@/lib/on-chain-events/erc721/erc721-approval';
import { Erc721ApprovalForAllEventData } from '@/lib/on-chain-events/erc721/erc721-approval-for-all';
import { Erc721TransferEventData } from '@/lib/on-chain-events/erc721/erc721-transfer';
import { ContractEvent } from '@/lib/on-chain-events/types';
import { getUserDisplayData } from '@/lib/utils';
import { getProvider } from '@/lib/utils/ethersUtils';

export async function validateOrders(
  query: Query<RawFirestoreOrderWithoutError>,
  contractEvent:
    | ContractEvent<Erc20ApprovalEventData>
    | ContractEvent<Erc20TransferEventData>
    | ContractEvent<Erc721ApprovalEventData>
    | ContractEvent<Erc721ApprovalForAllEventData>
    | ContractEvent<Erc721TransferEventData>,
  type: OrderEventKind.BalanceChange | OrderEventKind.ApprovalChange | OrderEventKind.TokenOwnerUpdate,
  batch: BatchHandler
) {
  const stream = streamQueryWithRef(query);

  for await (const { data: orderData, ref: orderRef } of stream) {
    const provider = getProvider(orderData.metadata.chainId);
    const timestamp = Date.now();
    const getMetadata = <T extends OrderEventKind>(type: T) => {
      return {
        id: `${type}:${Date.now()}`,
        isSellOrder: orderData.order.isSellOrder,
        orderId: orderData.metadata.id,
        chainId: orderData.metadata.chainId,
        processed: false,
        migrationId: 1,
        eventKind: type,
        timestamp,
        updatedAt: timestamp,
        eventSource: 'infinity-orderbook'
      } as OrderEventMetadata & { eventKind: T };
    };
    const chainIdInt = parseInt(orderData.metadata.chainId, 10);
    let order: Flow.Order | null = null;
    try {
      order = new Flow.Order(chainIdInt, orderData.rawOrder.infinityOrder as Flow.Types.SignedOrder);
    } catch (err) {
      logger.warn('indexer', `Failed to parse order ${err}`);
    }
    const status = await getOrderStatus(order);
    let statusEvent: OrderApprovalChangeEvent | OrderBalanceChangeEvent | OrderTokenOwnerUpdate;
    switch (type) {
      case OrderEventKind.ApprovalChange: {
        statusEvent = {
          metadata: getMetadata(OrderEventKind.ApprovalChange),
          data: {
            txHash: contractEvent.baseParams.txHash,
            txTimestamp: contractEvent.baseParams.blockTimestamp,
            status: status
          }
        };
        break;
      }
      case OrderEventKind.BalanceChange: {
        statusEvent = {
          metadata: getMetadata(OrderEventKind.BalanceChange),
          data: {
            txHash: contractEvent.baseParams.txHash,
            txTimestamp: contractEvent.baseParams.blockTimestamp,
            status: status
          }
        };
        break;
      }
      case OrderEventKind.TokenOwnerUpdate: {
        const _contractEvent = contractEvent as ContractEvent<Erc721TransferEventData>;
        const ownerAddress = _contractEvent.metadata.reorged
          ? await new Common.Helpers.Erc721(provider, _contractEvent.baseParams.address).getOwner(
              _contractEvent.event.tokenId
            )
          : _contractEvent.event.to;
        const ownerRef = getDb()
          .collection('users')
          .doc(ownerAddress) as FirebaseFirestore.DocumentReference<UserProfileDto>;
        const owner = await getUserDisplayData(ownerRef);
        statusEvent = {
          metadata: getMetadata(OrderEventKind.TokenOwnerUpdate),
          data: {
            txHash: contractEvent.baseParams.txHash,
            txTimestamp: contractEvent.baseParams.blockTimestamp,
            status: status,
            token: {
              address: _contractEvent.baseParams.address,
              tokenId: _contractEvent.event.tokenId
            },
            owner
          }
        };
        break;
      }
      default: {
        throw new Error(`Unhandled event type ${type}`);
      }
    }

    logger.log(
      'indexer',
      `Validated order ${orderData.metadata.id} - Status ${statusEvent.data.status} - Event ${type}`
    );

    const statusEventRef = orderRef.collection('orderEvents').doc(statusEvent.metadata.id);
    await batch.addAsync(statusEventRef, statusEvent, { merge: true });
  }
}

export async function getOrderStatus(order: Flow.Order | null): Promise<OrderStatus> {
  if (!order) {
    return 'expired';
  }
  const provider = getProvider(order.chainId.toString() as ChainId);
  const now = Date.now();
  const hasStarted = order.startTime * 1000 < now;
  const hasEnded = order.endTime * 1000 < now;
  if (!hasStarted) {
    return 'inactive';
  } else if (hasEnded) {
    return 'expired';
  }
  try {
    await order.checkFillability(provider);
    return 'active';
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not-fillable')) {
        return 'cancelled';
      }
      return 'inactive';
    }
    return 'inactive';
  }
}
