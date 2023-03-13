import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

async function main() {
  // const startBlockNum = 16528000;
  const startBlockNumGoerli = 8373022;
  const collection = undefined;
  const chainId = ChainId.Goerli;
  const db = getDb();
  await db.doc('/_sync/_reservoirSales/_reservoirSalesSyncMetadata/5:sales').delete();
  await Reservoir.Sales.addSyncs(getDb(), chainId, ['sales'], collection, startBlockNumGoerli);

  console.log(`Successfully initiated sales syncing for chain ${chainId}.`);
}

void main();
