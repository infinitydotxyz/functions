import { ChainId } from '@infinityxyz/lib/types/core';

import { getProvider } from '@/lib/utils/ethersUtils';

import { Reservoir } from '../..';
import { config } from '../config';
import { ErrorCode } from '../errors';
import { OrderError, OrderKindError, OrderSourceError } from '../errors/order.error';

export class OrderTransformerFactory {
  public create(chainId: ChainId, reservoirOrder: Reservoir.Api.Orders.Types.Order) {
    const source = reservoirOrder.kind;
    const provider = getProvider(chainId);
    if (!provider) {
      throw new OrderError(
        `provider not found for chain ${chainId}`,
        ErrorCode.Unexpected,
        `${provider}`,
        source,
        'unexpected'
      );
    }

    if (source in config && config[source].enabled) {
      const sourceConfig = config[source];
      if ('kinds' in sourceConfig) {
        const sourceKindConfig = sourceConfig.kinds;
        const kind = reservoirOrder.rawData?.kind as keyof typeof sourceKindConfig;
        if (kind in sourceKindConfig && sourceKindConfig[kind]) {
          const kindConfig = sourceKindConfig[kind];
          if (kindConfig.enabled && 'transformer' in kindConfig) {
            return new kindConfig.transformer(chainId, reservoirOrder, provider);
          }
          throw new OrderKindError(kind, source, 'unsupported');
        } else {
          console.log('kind not found', kind, sourceKindConfig);
        }
      } else {
        console.log('no kinds in source config');
      }
      throw new OrderSourceError(source, 'unexpected');
    } else if (source in config) {
      throw new OrderSourceError(source, 'unsupported');
    } else {
      throw new OrderSourceError(source, 'unexpected');
    }
  }
}
