import { BigNumberish } from 'ethers';

import { Flow } from '@reservoir0x/sdk';

export interface NativeTransformationResult {
  isNative: true;

  order: Flow.Order;
}

export interface NonNativeTransformationResult<T> {
  isNative: false;

  sourceOrder: T;

  flowOrder: Flow.Order;

  getSourceTxn: (
    timestamp: number,
    from: string
  ) => Promise<{
    data: string;
    to: string;
    from: string;
    value?: BigNumberish;
  }>;
}

export type TransformationResult<T> = NativeTransformationResult | NonNativeTransformationResult<T>;
