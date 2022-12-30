import { providers } from 'ethers/lib/ethers';

import {
  DisplayOrder,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError
} from '@infinityxyz/lib/types/core';

import { Firestore } from '@/firestore/types';
import { OrderStatus } from '@/lib/reservoir/api/orders/types';

import { GasSimulator } from './gas-simulator/gas-simulator';

export class OrderUpdater {
  protected _rawOrder: RawFirestoreOrderWithoutError;
  protected _displayOrder: DisplayOrder;
  constructor(
    protected _db: Firestore,
    protected _provider: providers.StaticJsonRpcProvider,
    protected _gasSimulator: GasSimulator,
    rawOrder: RawFirestoreOrder,
    displayOrder: FirestoreDisplayOrder
  ) {
    if (rawOrder.metadata.hasError || 'error' in rawOrder) {
      throw new Error('cannot create order with error');
    }
    this._rawOrder = rawOrder;

    if ('error' in displayOrder) {
      throw new Error('cannot create order with error');
    }
    this._displayOrder = displayOrder.displayOrder;
  }

  get queryableOrder() {
    return this._rawOrder.order;
  }

  get displayOrder(): FirestoreDisplayOrderWithoutError {
    return {
      metadata: this._rawOrder.metadata,
      order: this.queryableOrder,
      displayOrder: this._displayOrder
    };
  }

  get rawOrder(): RawFirestoreOrderWithoutError {
    return {
      metadata: this._rawOrder.metadata,
      rawOrder: this._rawOrder.rawOrder,
      order: this.queryableOrder
    };
  }

  setStatus(status: OrderStatus) {
    if (this._rawOrder.order.status === 'active' || this._rawOrder.order.status === 'inactive' || status === 'filled') {
      this._rawOrder.order.status = status;
      this._rawOrder.order.isValid = status === 'active' || status === 'inactive';
    }
  }

  setGasUsage(gasUsage: number) {
    this._rawOrder.order.gasUsage = gasUsage;
    this._rawOrder.order.gasUsageString = gasUsage.toString();
  }
}
