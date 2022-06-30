import { FirestoreOrderItem, ChainId, OBOrderStatus } from '@infinityxyz/lib/types/core';
import { getTxnCurrencyAddress, getOBComplicationAddress } from '@infinityxyz/lib/utils';
import { nanoid } from 'nanoid';
import { getDb } from '../../firestore';
import { OrderItem } from '../order-item';

export const getOrderItem = (firestoreOrderItem: Partial<FirestoreOrderItem>) => {
  const chainId = firestoreOrderItem.chainId ?? ChainId.Goerli;
  const item: FirestoreOrderItem = {
    id: firestoreOrderItem.id ?? nanoid(),
    currencyAddress: firestoreOrderItem.currencyAddress ?? getTxnCurrencyAddress(chainId),
    orderStatus: firestoreOrderItem.orderStatus ?? OBOrderStatus.ValidActive,
    chainId: chainId,
    isSellOrder: firestoreOrderItem.isSellOrder ?? true,
    numItems: firestoreOrderItem.numItems ?? 1,
    startPriceEth: firestoreOrderItem.startPriceEth ?? 0.1,
    endPriceEth: firestoreOrderItem.endPriceEth ?? 0.1,
    startTimeMs: firestoreOrderItem.startTimeMs ?? Date.now(),
    endTimeMs: firestoreOrderItem.endTimeMs ?? Date.now() + 2 * 24 * 60 * 60 * 1000,
    makerUsername: firestoreOrderItem.makerUsername ?? '',
    makerAddress: firestoreOrderItem.makerAddress ?? '0x02Bf5bDD3387ffD93474252a95b16976429707cC'.toLowerCase(),
    takerUsername: firestoreOrderItem.takerUsername ?? '',
    takerAddress: firestoreOrderItem.takerAddress ?? '',
    collectionAddress: firestoreOrderItem.collectionAddress ?? '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
    collectionName: firestoreOrderItem.collectionName ?? '',
    collectionImage: firestoreOrderItem.collectionImage ?? '',
    collectionSlug: firestoreOrderItem.collectionSlug ?? '',
    hasBlueCheck: firestoreOrderItem.hasBlueCheck ?? false,
    tokenId: firestoreOrderItem.tokenId ?? '1',
    tokenName: firestoreOrderItem.tokenName ?? '',
    tokenImage: firestoreOrderItem.tokenImage ?? '',
    tokenSlug: firestoreOrderItem.tokenSlug ?? '',
    numTokens: firestoreOrderItem.numTokens ?? 1,
    complicationAddress: firestoreOrderItem.complicationAddress ?? getOBComplicationAddress(chainId),
    attributes: firestoreOrderItem.attributes ?? []
  };
  const db = getDb();
  const orderItem = new OrderItem(item, db);
  return orderItem;
};
