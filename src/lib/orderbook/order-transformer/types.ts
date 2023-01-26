import { BigNumberish } from 'ethers';

import { Infinity } from '@reservoir0x/sdk';

export interface NativeTransformationResult {
  isNative: true;

  order: Infinity.Order;
}

export interface NonNativeTransformationResult<T> {
  isNative: false;

  sourceOrder: T;

  infinityOrder: Infinity.Order;

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
