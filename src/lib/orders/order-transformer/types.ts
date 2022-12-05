import { Infinity } from '@reservoir0x/sdk';

export interface NativeTransformationResult {
  isNative: true;

  order: Infinity.Order;
}

export interface NonNativeTransformationResult<T> {
  isNative: false;

  sourceOrder: T;

  infinityOrders: Infinity.Order[];
}

export type TransformationResult<T> = NativeTransformationResult | NonNativeTransformationResult<T>;
