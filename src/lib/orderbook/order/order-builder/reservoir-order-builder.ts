import { BaseRawOrder, RawOrder, RawOrderWithError, RawOrderWithoutError } from '@infinityxyz/lib/types/core';

import { config } from '@/config/index';
import { Orderbook, Reservoir } from '@/lib/index';
import { AskOrder } from '@/lib/reservoir/api/orders/types';

import { ErrorCode, NotFoundError, OrderError, UnexpectedOrderError } from '../../errors';
import { TransformationResult } from '../../order-transformer/types';
import { OrderBuilder } from './order-builder.abstract';

export class ReservoirOrderBuilder extends OrderBuilder {
  public async buildOrder(
    orderId: string,
    isSellOrder: boolean,
    reservoirOrder?: AskOrder
  ): Promise<{ order: RawOrder; initialStatus: 'active' | 'inactive' }> {
    const baseOrder: Omit<BaseRawOrder, 'createdAt' | 'infinityOrderId'> = {
      id: orderId,
      chainId: this._chainId,
      updatedAt: Date.now(),
      isSellOrder: isSellOrder
    };

    try {
      /**
       * get the raw order from reservoir
       */
      if (!reservoirOrder) {
        reservoirOrder = await this._getReservoirOrder(orderId, isSellOrder);
      }

      /**
       * transform the order have a corresponding infinity order
       */
      const factory = new Orderbook.Transformers.OrderTransformerFactory();
      const transformer = factory.create(this._chainId, reservoirOrder);
      const result = await transformer.transform();

      /**
       * calculate the gas used to fulfill the order on the
       * external marketplace
       */
      let gasUsage = '0';
      let initialStatus: 'active' | 'inactive' = 'active';
      try {
        gasUsage = await this._getGasUsage(result, reservoirOrder.kind, reservoirOrder.id);
      } catch (err) {
        initialStatus = 'inactive';
      }

      const infinityOrder = result.isNative ? result.order : result.infinityOrder;
      const sourceOrder = result.isNative ? result.order : result.sourceOrder;

      const isDynamic = infinityOrder.startPrice !== infinityOrder.endPrice;

      let chainOBOrder;
      if (result.isNative) {
        chainOBOrder = infinityOrder.getSignedOrder();
      } else {
        chainOBOrder = {
          ...infinityOrder.getInternalOrder(infinityOrder.params),
          sig: ''
        };
      }

      const order: RawOrderWithoutError = {
        ...baseOrder,
        infinityOrderId: infinityOrder.hash(),
        source: reservoirOrder.kind,
        rawOrder: sourceOrder.params,
        infinityOrder: chainOBOrder,
        gasUsage,
        isDynamic,
        createdAt: new Date(reservoirOrder.createdAt).getTime()
      };
      return { order, initialStatus };
    } catch (err) {
      if (err instanceof OrderError) {
        const orderData: RawOrderWithError = {
          ...baseOrder,
          error: err.toJSON(),
          createdAt: 0
        };
        return { order: orderData, initialStatus: 'inactive' };
      }
      console.error(err);
      const orderData: RawOrderWithError = {
        ...baseOrder,
        error: new UnexpectedOrderError(`failed to build order ${orderId}`).toJSON(),
        createdAt: 0
      };
      return { order: orderData, initialStatus: 'inactive' };
    }
  }

  protected async _getReservoirOrder(orderId: string, isSellOrder: boolean) {
    try {
      const client = Reservoir.Api.getClient(this._chainId, config.reservoir.apiKey);
      const OrderSide = isSellOrder ? Reservoir.Api.Orders.AskOrders : Reservoir.Api.Orders.BidOrders;
      const response = await OrderSide.getOrders(client, {
        ids: orderId,
        includeMetadata: true,
        includeRawData: true,
        limit: 1
      });

      const order = response.data.orders[0];

      if (!order || !order.rawData) {
        throw new NotFoundError(`reservoir order not found ${orderId}`);
      }

      return order;
    } catch (err) {
      if (err instanceof OrderError) {
        throw err;
      }
      console.error(err);
      throw new UnexpectedOrderError(`failed to get reservoir order ${orderId}`);
    }
  }

  protected async _getGasUsage(
    transformationResult: TransformationResult<unknown>,
    orderKind: Reservoir.Api.Orders.Types.OrderKind,
    orderId: string
  ) {
    let gasUsage = '0';
    if (!transformationResult.isNative) {
      try {
        gasUsage = await this._gasSimulator.simulate(
          await transformationResult.getSourceTxn(Date.now(), this._gasSimulator.simulationAccount)
        );
      } catch (err) {
        throw new OrderError(
          `failed to simulate gas usage for order ${orderId}`,
          ErrorCode.GasUsage,
          `${err?.toString?.()}`,
          orderKind,
          'unexpected'
        );
      }
    }

    return gasUsage;
  }
}
