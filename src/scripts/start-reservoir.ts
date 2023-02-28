import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

export async function main() {
  const startTimestamp = Date.now();
  await Reservoir.OrderEvents.addSyncs(getDb(), ChainId.Goerli, ['ask', 'bid'], undefined, startTimestamp);
}

void main();
