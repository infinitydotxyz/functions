import { Seaport } from '@reservoir0x/sdk';

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

  public transform(): Promise<TransformationResult<Seaport.Order>> {
    return Promise.resolve({
      isNative: false,
      sourceOrder: this._order,
      infinityOrder: this.getInfinityOrder(),
      getSourceTxn: (timestamp: number, from: string) => {
        const seaport = new Seaport.Exchange(this.chainId);
        const priceAtTime = this._order.getMatchingPrice(timestamp);
        const builder = new Seaport.Builders.SingleToken(this.chainId);
        const matchParams = builder.buildMatching(this._order, { amount: priceAtTime });
        const data = seaport.fillOrderTx(from, this._order, matchParams);
        return data;
      }
    });
  }
}
