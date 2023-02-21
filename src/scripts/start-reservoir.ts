import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

export async function main() {
  await Reservoir.OrderEvents.addSyncs(
    getDb(),
    ChainId.Goerli,
    ['collection-ask'],
    '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
    Date.now()
  );
}

void main();
