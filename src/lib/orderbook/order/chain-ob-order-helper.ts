import { BigNumber } from 'ethers';

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
    const constraints = order.constraints.map((item) => BigNumber.from(item).toString());
    /**
     * addresses are trimLowerCased in the construction of the extended class
     * nfts are normalized and de-duplicated in the construction of the extended class
     */
    super(parseInt(chainId), {
      isSellOrder: order.isSellOrder,
      signer: order.signer,
      numItems: parseInt(constraints[0], 10),
      startPrice: constraints[1],
      endPrice: constraints[2],
      startTime: parseInt(constraints[3], 10),
      endTime: parseInt(constraints[4], 10),
      nonce: constraints[5],
      maxGasPrice: constraints[6],
      nfts: order.nfts,
      complication: order.execParams[0],
      currency: order.execParams[1],
      extraParams: order.extraParams,
      signature: order.sig
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
