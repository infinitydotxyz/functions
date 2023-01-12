import { ErrorCode, OrderError } from '../../errors';
import { InfinityOrderTransformer } from './base-order-transformer';

export class ContractWideOrderTransformer extends InfinityOrderTransformer {
  protected _checkOrderKindValid(): void {
    let numTokens = 0;
    let numCollections = 0;
    for (const { tokens } of this._order.nfts) {
      numCollections += 1;

      numTokens += tokens.length;
    }

    if (numTokens !== 0) {
      throw new OrderError(
        'expected collection wide order, but found specific tokens',
        ErrorCode.OrderTokenQuantity,
        numTokens.toString(),
        this.source,
        'unexpected'
      );
    } else if (numCollections !== 1) {
      throw new OrderError(
        'only single collection, contract wide orders are supported',
        ErrorCode.OrderTokenQuantity,
        numCollections.toString(),
        this.source,
        'unexpected'
      );
    }
  }
}
