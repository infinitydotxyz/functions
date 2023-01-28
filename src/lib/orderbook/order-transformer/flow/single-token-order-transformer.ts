import { ErrorCode, OrderError } from '../../errors';
import { FlowOrderTransformer } from './base-order-transformer';

export class SingleTokenOrderTransformer extends FlowOrderTransformer {
  protected _checkOrderKindValid(): void {
    let numTokens = 0;
    let numCollections = 0;
    for (const { tokens } of this._order.nfts) {
      numCollections += 1;

      for (const token of tokens) {
        numTokens += 1;

        if (token.numTokens !== 1) {
          throw new OrderError(
            'expected a quantity of 1',
            ErrorCode.OrderTokenQuantity,
            token.numTokens.toString(),
            this.source,
            'unsupported'
          );
        }
      }
    }
    if (numTokens !== 1) {
      throw new OrderError(
        'expected a single token order, but found multiple tokens',
        ErrorCode.OrderTokenQuantity,
        numTokens.toString(),
        this.source,
        'unexpected'
      );
    } else if (numCollections !== 1) {
      throw new OrderError(
        'expected a single collection in the order, but found multiple',
        ErrorCode.OrderTokenQuantity,
        numCollections.toString(),
        this.source,
        'unexpected'
      );
    } else if (this._order.numItems !== 1) {
      throw new OrderError(
        'expected num items to be 1',
        ErrorCode.OrderTokenQuantity,
        numTokens.toString(),
        this.source,
        'unexpected'
      );
    }
  }
}
