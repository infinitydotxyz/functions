// import { syncSaleEvents } from 'functions/reservoir/sync-sale-events';
import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

// import { Reservoir } from '../lib';

async function main() {
  const startBlockNum = 16485264;

  const chainId = ChainId.Mainnet;
  const db = getDb();
  const ref = db.doc('/_sync/_reservoirOrderEvents/_reservoirOrderEventSyncMetadata/1:ask');
  const snape = await ref.get();
  const doc = snape.data();
  const update = {
    metadata: {
      ...doc?.metadata,
      isPaused: true
    }
  };

  await ref.set(update, { merge: true });

  // await Reservoir.Sales.addSyncs(getDb(), chainId, ['sales'], startBlockNum);

  // console.log(`Successfully initiated sales syncing for chain ${chainId}.`);

  // await s();
}

// async function s() {
// const db = getDb();
// await syncSaleEvents(db, 1000 * 60 * 60 * 24, { pollInterval: 10 * 1000, delay: 1000 });
// }

void main();
