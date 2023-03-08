import { BigNumberish, constants, ethers } from 'ethers';



import { ChainId } from '@infinityxyz/lib/types/core';
import * as Sdk from '@reservoir0x/sdk';



import { Reservoir } from '../..';
import { ErrorCode } from '../errors/error-code';
import { OrderCurrencyError, OrderDynamicError, OrderError, OrderSideError } from '../errors/order.error';
import { TransformationResult } from './types';


export abstract class OrderTransformer<SourceOrder = never> {
  get chainId(): number {
    return parseInt(this._chainId, 10);
  }

  protected abstract _order: SourceOrder;

  constructor(
    protected _chainId: ChainId,
    protected _reservoirOrder: Pick<Reservoir.Api.Orders.Types.Order, 'kind' | 'source' | 'side' | 'rawData'>,
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

  abstract get nfts(): Sdk.Flow.Types.OrderNFTs[];

  abstract get numItems(): number;

  abstract get isPrivate(): boolean;

  abstract get isERC721(): boolean;

  protected abstract _checkValid(): void;
  public abstract transform(): Promise<TransformationResult<SourceOrder>>;

  get isSellOrder() {
    return this._reservoirOrder.side === 'sell';
  }

  protected _baseCheck() {
    if (this.source !== 'flow') {
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

    if (this.maker === constants.AddressZero) {
      throw new OrderError('invalid signer', ErrorCode.Signer, this.maker, this.source, 'unsupported');
    }

    /**
     * only static orders are supported
     */
    if (this.startPrice.toString() !== this.endPrice.toString()) {
      throw new OrderDynamicError(this.source);
    }

    if (this.numItems !== 1) {
      throw new OrderError(
        'only single item orders are supported',
        ErrorCode.OrderTokenQuantity,
        this.numItems?.toString?.(),
        this.source,
        'unsupported'
      );
    }
  }

  protected checkValid() {
    this._baseCheck();
    this._checkValid();
  }

  public getFlowOrder(): Sdk.Flow.Order {
    this.checkValid();

    const order = new Sdk.Flow.Order(this.chainId, {
      signer: ethers.constants.AddressZero, // joe-todo: must be updated
      nonce: '0', // joe-todo: must be updated
      maxGasPrice: '0', // joe-todo: must be updated
      isSellOrder: this.isSellOrder,
      startTime: this.startTime,
      endTime: this.endTime,
      startPrice: this.startPrice.toString(),
      endPrice: this.endPrice.toString(),
      /**
       * all orders are in WETH for simplicity
       */
      currency: Sdk.Common.Addresses.Weth[this.chainId],
      numItems: this.numItems,
      nfts: this.nfts,
      complication: Sdk.Flow.Addresses.ComplicationV2[this.chainId],
      extraParams: ethers.constants.HashZero,
      trustedExecution: '0'
    });

    return order;
  }
}