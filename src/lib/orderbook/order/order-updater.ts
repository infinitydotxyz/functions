import {
  DisplayOrder,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError,
  UserDisplayData
} from '@infinityxyz/lib/types/core';

import { OrderStatus } from '@/lib/reservoir/api/orders/types';

export class OrderUpdater {
  protected _rawOrder: RawFirestoreOrderWithoutError;
  protected _displayOrder: DisplayOrder;
  constructor(rawOrder: RawFirestoreOrder, displayOrder: FirestoreDisplayOrder) {
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
      this._rawOrder.metadata.processed = false;
    }
  }

  setOwner(displayData: UserDisplayData) {
    this._rawOrder.order.owners = [displayData.address];
    this._displayOrder;
  }

  setGasUsage(gasUsage: number) {
    this._rawOrder.order.gasUsage = gasUsage;
    this._rawOrder.order.gasUsageString = gasUsage.toString();
  }
}
