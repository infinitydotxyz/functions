import { constants, ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';
import { getOBComplicationAddress } from '@infinityxyz/lib/utils';
import { Infinity } from '@reservoir0x/sdk';

import { Reservoir } from '@/lib/index';

import { ErrorCode, OrderError } from '../../errors';
import { OrderTransformer } from '../order-transformer.abstract';
import { TransformationResult } from '../types';

export abstract class InfinityOrderTransformer extends OrderTransformer<Infinity.Order> {
  protected _order: Infinity.Order;

  /**
   * perform order kind specific checks on the order
   */
  protected abstract _checkOrderKindValid(): void;

  readonly source: 'infinity';

  constructor(
    chainId: ChainId,
    reservoirOrder: Pick<Reservoir.Api.Orders.Types.Order, 'kind' | 'source' | 'side' | 'rawData'>,
    provider: ethers.providers.StaticJsonRpcProvider
  ) {
    super(chainId, reservoirOrder, provider);
    this._order = new Infinity.Order(this.chainId, this._reservoirOrder.rawData as Infinity.Types.SignedOrder);
  }

  public get kind() {
    return this._order.kind;
  }

  public get maker() {
    return this._order.params.signer;
  }

  public get startTime() {
    return this._order.startTime;
  }

  public get endTime() {
    return this._order.endTime;
  }

  public get startPrice() {
    return this._order.startPrice;
  }

  public get endPrice() {
    return this._order.endPrice;
  }

  public get currency() {
    return this._order.currency;
  }

  public get nfts() {
    return this._order.nfts;
  }

  public get numItems() {
    return this._order.numItems;
  }

  public get isPrivate() {
    if (this._order.extraParams !== constants.AddressZero && this._order.extraParams !== constants.HashZero) {
      return ethers.utils.isAddress(this._order.extraParams);
    }
    return false;
  }

  public get isERC721() {
    return true;
  }

  protected _checkValid() {
    if (!this._order.sig) {
      throw new OrderError('order not signed', ErrorCode.NotSigned, '', 'infinity', 'unsupported');
    }
    const complication = getOBComplicationAddress(this._chainId);

    if (
      complication === constants.AddressZero ||
      this._order.complication !== getOBComplicationAddress(this._chainId)
    ) {
      throw new OrderError(
        'invalid complication',
        ErrorCode.InfinityComplication,
        this._order.complication,
        'infinity',
        'unsupported'
      );
    }

    this._checkOrderKindValid();
  }

  public transform(): Promise<TransformationResult<Infinity.Order>> {
    return Promise.resolve({
      isNative: true,
      order: this._order
    });
  }

  public getInfinityOrder(): Infinity.Order {
    this.checkValid();
    return this._order;
  }
}
