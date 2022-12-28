import { ChainId } from '@infinityxyz/lib/types/core';
import { ChainOBOrderDto } from '@infinityxyz/lib/types/dto';
import { formatEth } from '@infinityxyz/lib/utils';
import { Infinity } from '@reservoir0x/sdk';

/**
 * ChainOBOrderHelper normalizes order data, and
 * provides methods to verify the signature and fillability
 */
export class ChainOBOrderHelper extends Infinity.Order {
  constructor(chainId: ChainId, order: ChainOBOrderDto) {
    const constraints = order.constraints.map((item) => item.toString());
    super(parseInt(chainId, 10), {
      ...order,
      constraints
    });
  }

  isSigValid() {
    try {
      this._verifySig(this.sig);
      return true;
    } catch (err) {
      return false;
    }
  }

  get startPriceEth() {
    return formatEth(this.startPrice, 6);
  }

  get endPriceEth() {
    return formatEth(this.endPrice, 6);
  }

  get startTimeMs() {
    return this.startTime * 1000;
  }

  get endTimeMs() {
    return this.endTime * 1000;
  }
}
