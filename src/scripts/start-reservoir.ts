import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

export async function main() {
  await Reservoir.OrderEvents.addSyncs(
    getDb(),
    ChainId.Mainnet,
    ['collection-bid'],
    '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
    Date.now()
  );
}

void main();
