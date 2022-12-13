import { ChainId, RawOrder } from '@infinityxyz/lib/types/core';

import { GasSimulator } from '../gas-simulator/gas-simulator';

export abstract class OrderBuilder {
  constructor(protected _chainId: ChainId, protected _gasSimulator: GasSimulator) {}

  public abstract buildOrder(
    orderId: string,
    isSellOrder: boolean
  ): Promise<{ order: RawOrder; initialStatus: 'active' | 'inactive' }>;
}
