import { BaseRawOrder, RawOrder, RawOrderWithError, RawOrderWithoutError } from '@infinityxyz/lib/types/core';
import { sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { Orderbook, Reservoir } from '@/lib/index';
import { AskOrder, BidOrder } from '@/lib/reservoir/api/orders/types';

import {
  ErrorCode,
  FailedToGetReservoirOrderError,
  NotFoundError,
  OrderError,
  UnexpectedOrderError
} from '../../errors';
import { TransformationResult } from '../../order-transformer/types';
import { OrderBuilder } from './order-builder.abstract';

export class ReservoirOrderBuilder extends OrderBuilder {
  public async buildOrder(
    orderId: string,
    isSellOrder: boolean,
    reservoirOrder?: AskOrder | BidOrder
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
       * transform the order have a corresponding flow order
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

      const flowOrder = result.isNative ? result.order : result.flowOrder;
      const sourceOrder = result.isNative ? result.order : result.sourceOrder;

      const isDynamic = flowOrder.startPrice !== flowOrder.endPrice;

      let chainOBOrder;
      if (result.isNative) {
        chainOBOrder = flowOrder.getSignedOrder();
      } else {
        chainOBOrder = {
          ...flowOrder.getInternalOrder(flowOrder.params),
          sig: ''
        };
      }

      const order: RawOrderWithoutError = {
        ...baseOrder,
        infinityOrderId: flowOrder.hash(),
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
      let order;

      try {
        order = await this._getReservoirOrderFromCache(orderId);
        if (order) {
          console.log(`${this._chainId}:${isSellOrder ? 'ask' : 'bid'} CACHE HIT ${orderId}`);
        } else {
          console.log(`${this._chainId}:${isSellOrder ? 'ask' : 'bid'} CACHE MISS ${orderId}`);

          order = await this._getReservoirOrderFromApi(orderId, isSellOrder);
        }
      } catch (err) {
        console.error(`Failed to load order ${orderId}`, err);
      }

      if (!order || !order.rawData) {
        throw new NotFoundError(`reservoir order not found ${orderId}`);
      }

      return order;
    } catch (err) {
      if (err instanceof OrderError) {
        throw err;
      }
      console.error(err);
      throw new FailedToGetReservoirOrderError();
    }
  }

  protected async _getReservoirOrderFromCache(orderId: string) {
    const redis = config.redis.getRedis();
    if (redis) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const orderString = await redis.get(`reservoir:orders-cache:${orderId}`);

        try {
          const order = JSON.parse(orderString ?? '') as AskOrder | BidOrder;
          return order;
        } catch (err) {
          // noop
        }
        await sleep(1000);
      }
      return null;
    }
    return null;
  }

  protected async _getReservoirOrderFromApi(orderId: string, isSellOrder: boolean) {
    const client = Reservoir.Api.getClient(this._chainId, ''); // don't use an api key here
    const OrderSide = isSellOrder ? Reservoir.Api.Orders.AskOrders : Reservoir.Api.Orders.BidOrders;
    const response = await OrderSide.getOrders(client, {
      ids: [orderId],
      includeRawData: true,
      limit: 1
    });

    const order = response.data.orders[0];

    return order;
  }

  protected async _getGasUsage(
    transformationResult: TransformationResult<unknown>,
    orderKind: Reservoir.Api.Orders.Types.OrderKind,
    orderId: string
  ) {
    let gasUsage = '0';
    if (!transformationResult.isNative) {
      try {
        const sourceTxn = await transformationResult.getSourceTxn(Date.now(), this._gasSimulator.simulationAccount);
        gasUsage = await this._gasSimulator.simulate(sourceTxn);
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
