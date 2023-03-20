import Redis from 'ioredis';

import { ChainId } from '@infinityxyz/lib/types/core';

import { ProcessOptions } from '@/lib/process/types';

import { AbstractBlockProcessor } from '../block-processor/block-processor.abstract';

export class FlowExchange extends AbstractBlockProcessor {
  getKind() {
    return 'flowExchange' as const;
  }

  constructor(_db: Redis, chainId: ChainId, _address: string, options?: ProcessOptions) {
    super(_db, chainId, `flow-exchange:${_address}`, _address, options);
  }
}
