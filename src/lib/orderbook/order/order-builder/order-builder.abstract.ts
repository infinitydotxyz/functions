import { ChainId } from '@infinityxyz/lib/types/core';

import { GasSimulator } from '../gas-simulator/gas-simulator';
import { RawOrder } from '../types';

export abstract class OrderBuilder {
  constructor(protected _chainId: ChainId, protected _gasSimulator: GasSimulator) {}

  public abstract buildOrder(orderId: string, isSellOrder: boolean): Promise<RawOrder>;
}
