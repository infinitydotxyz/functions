import { constants } from 'ethers';

import { Order, Types } from '../..';
import { getComplication } from '../../complications';
import { BaseBuilder } from '../base';

export type ComplexOrderParams = Omit<Types.OrderInput, 'complication' | 'extraParams' | 'trustedExecution'> &
  Partial<Pick<Types.OrderInput, 'complication' | 'trustedExecution'>>;

export class ComplexBuilder extends BaseBuilder<ComplexOrderParams> {
  public isValid(order: Order): boolean {
    try {
      order.checkBaseValid();
      return true;
    } catch (err) {
      return false;
    }
  }

  public build(params: ComplexOrderParams): Order {
    const order = new Order(this.chainId, {
      trustedExecution: '0',
      complication: getComplication(this.chainId).address,
      ...params,
      extraParams: constants.HashZero
    });

    return order;
  }
}
