import { SeaportBase, SeaportV11 } from '@reservoir0x/sdk';

import { ErrorCode } from '../../errors/error-code';
import { OrderError } from '../../errors/order.error';
import { TransformationResult } from '../types';
import { SeaportOrderTransformer } from './base-order-transformer';

export class SingleTokenOrderTransformer extends SeaportOrderTransformer {
  protected _checkOrderKindValid(): void {
    if (this.numItems !== 1) {
      throw new OrderError(
        "expected a single token order, but the order's numItems is not 1",
        ErrorCode.OrderTokenQuantity,
        `${this.numItems}`,
        this.source,
        'unexpected'
      );
    }
  }

  public transform(): Promise<TransformationResult<SeaportV11.Order>> {
    return Promise.resolve({
      isNative: false,
      sourceOrder: this._order,
      flowOrder: this.getFlowOrder(),
      getSourceTxn: async (timestamp: number, from: string) => {
        const seaport = new SeaportV11.Exchange(this.chainId);
        const builder = new SeaportBase.Builders.SingleToken(this.chainId);
        const matchParams = builder.buildMatching(this._order);
        const data = await seaport.fillOrderTx(from, this._order, matchParams);
        return data;
      }
    });
  }
}
