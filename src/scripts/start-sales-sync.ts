import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

async function main() {
  const startBlockNum = 16530500; // TODO sync from alchemy to here

  const chainId = ChainId.Mainnet;
  const db = getDb();
  await db.doc('/_sync/_reservoirSales/_reservoirSalesSyncMetadata/1:sales').delete();
  await Reservoir.Sales.addSyncs(getDb(), chainId, ['sales'], startBlockNum);

  console.log(`Successfully initiated sales syncing for chain ${chainId}.`);
}

void main();
