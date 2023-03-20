import Redis from 'ioredis';

import { ChainId } from '@infinityxyz/lib/types/core';

import { ProcessOptions } from '@/lib/process/types';

import { AbstractBlockProcessor } from '../block-processor/block-processor.abstract';

export class Erc721 extends AbstractBlockProcessor {
  getKind() {
    return 'erc721' as const;
  }

  constructor(_db: Redis, chainId: ChainId, _address: string, options?: ProcessOptions) {
    super(_db, chainId, `erc721:${_address}`, _address, options);
  }
}
