import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

async function main() {
  const startBlockNum = 16485264;

  const chainId = ChainId.Mainnet;
  await Reservoir.Sales.addSyncs(getDb(), chainId, ['sales'], startBlockNum);

  console.log(`Successfully initiated sales syncing for chain ${chainId}.`);
}

void main();
