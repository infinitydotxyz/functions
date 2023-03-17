import {
  ChainId,
  DisplayOrder,
  FirestoreDisplayOrder,
  FirestoreDisplayOrderWithoutError,
  RawFirestoreOrder,
  RawFirestoreOrderWithoutError,
  UserDisplayData
} from '@infinityxyz/lib/types/core';
import { Seaport } from '@reservoir0x/sdk';

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

    if (!this.isSupported() && this._rawOrder.order.status === 'active') {
      this._rawOrder.order.status = 'inactive';
      this._rawOrder.order.isValid = true;
      this._rawOrder.metadata.processed = false;
    }
  }

  isSupported() {
    /**
     * todo update this to support unsigned seaport orders on testnets
     */
    if (this.rawOrder.metadata.chainId !== ChainId.Mainnet) {
      switch (this.rawOrder.metadata.source) {
        case 'seaport':
        case 'seaport-v1.4': {
          if (!(this.rawOrder?.rawOrder?.rawOrder as Seaport.Types.OrderComponents)?.signature) {
            return false;
          }
        }
      }
    }

    return true;
  }

  setTokenOwner(owner: UserDisplayData, token: { address: string; tokenId: string }) {
    const items = 'items' in this._displayOrder ? this._displayOrder.items : [this._displayOrder.item];
    const owners: string[] = [];

    for (const item of items) {
      if (item.address === token.address) {
        switch (item.kind) {
          case 'collection-wide':
            break;
          case 'single-token':
            if (item.token.tokenId === token.tokenId) {
              item.token.owner = owner;
            }
            owners.push(item.token.owner.address);
            break;
          case 'token-list':
            for (const token of item.tokens) {
              if (token.tokenId === token.tokenId) {
                token.owner = owner;
              }
              owners.push(token.owner.address);
              break;
            }
        }
      }
    }

    this._rawOrder.order.owners = [...new Set(owners)];
  }

  setComplication(complication: string) {
    if (this._rawOrder.rawOrder.infinityOrder.sig !== '') {
      throw new Error('cannot set complication on signed order');
    }
    this._rawOrder.order.complication = complication;
    this._rawOrder.rawOrder.infinityOrder.execParams[0] = complication;
  }

  setGasUsage(gasUsage: number) {
    this._rawOrder.order.gasUsage = gasUsage;
    this._rawOrder.order.gasUsageString = gasUsage.toString();
  }
}
