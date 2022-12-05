import { BigNumberish, ethers } from 'ethers';

import { ChainId } from '@infinityxyz/lib/types/core';
import * as Sdk from '@reservoir0x/sdk';

import { Reservoir } from '../..';
import { ErrorCode } from '../errors/error-code';
import { OrderCurrencyError, OrderError, OrderSideError } from '../errors/order.error';
import { TransformationResult } from './types';

export abstract class OrderTransformer<SourceOrder = never> {
  get chainId(): number {
    return parseInt(this._chainId, 10);
  }

  protected abstract _order: SourceOrder;

  constructor(
    protected _chainId: ChainId,
    protected _reservoirOrder: Reservoir.Api.Orders.Types.Order,
    protected _provider: ethers.providers.StaticJsonRpcProvider
  ) {
    if (!this._reservoirOrder.rawData) {
      throw new Error('rawData is required');
    }
  }

  abstract readonly source: Reservoir.Api.Orders.Types.OrderKind;

  abstract get maker(): string;

  abstract get startTime(): number;
  abstract get endTime(): number;

  abstract get startPrice(): BigNumberish;
  abstract get endPrice(): BigNumberish;

  abstract get currency(): string;

  abstract get nfts(): Sdk.Infinity.Types.OrderNFTs[];

  abstract get numItems(): number;

  abstract get isPrivate(): boolean;

  abstract get isERC721(): boolean;

  protected abstract _checkValid(): void;
  public abstract transform(): Promise<TransformationResult<SourceOrder>>;

  get isSellOrder() {
    return this._reservoirOrder.side === 'sell';
  }

  protected _baseCheck() {
    if (this.source !== 'infinity') {
      /**
       * only sell orders are supported
       */
      if (!this.isSellOrder) {
        throw new OrderSideError(this.isSellOrder, this.source, 'unsupported');
      }

      /**
       * only open orders are supported
       */
      if (this.isPrivate) {
        throw new OrderError('private order', ErrorCode.OrderPrivate, `true`, this.source);
      }

      /**
       * only ERC721 tokens are supported
       */
      if (!this.isERC721) {
        throw new OrderError('non-erc721 order', ErrorCode.OrderTokenStandard, `true`, this.source);
      }

      const supportedCurrencies = [Sdk.Common.Addresses.Weth[this.chainId], Sdk.Common.Addresses.Eth[this.chainId]];
      if (!supportedCurrencies.includes(this.currency)) {
        throw new OrderCurrencyError(this.source, this.currency);
      }
    }
  }

  protected checkValid() {
    this._baseCheck();
    this._checkValid();
  }

  public getInfinityOrder(): Sdk.Infinity.Order {
    this.checkValid();

    const order = new Sdk.Infinity.Order(this.chainId, {
      signer: ethers.constants.AddressZero, // TODO must be updated
      isSellOrder: this.isSellOrder,
      startTime: this.startTime,
      endTime: this.endTime,
      startPrice: this.startPrice.toString(),
      endPrice: this.endPrice.toString(),
      currency: this.currency,
      numItems: this.numItems,
      nonce: '0', // TODO must be updated
      maxGasPrice: '0', // TODO must be updated
      nfts: this.nfts,
      complication: Sdk.Infinity.Addresses.Complication[this.chainId],
      extraParams: ethers.constants.HashZero
    });

    return order;
  }
}
