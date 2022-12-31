import { ErrorCode, OrderError } from '../../errors';
import { InfinityOrderTransformer } from './base-order-transformer';

export class ComplexOrderTransformer extends InfinityOrderTransformer {
  protected _checkOrderKindValid(): void {
    throw new OrderError(
      'complex orders are not yet supported',
      ErrorCode.OrderKind,
      this._order.kind,
      this.source,
      'unsupported'
    );
  }
}
