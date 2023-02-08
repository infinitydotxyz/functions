import { getDb } from '@/firestore/db';

import { Reservoir } from '../lib';

async function main() {
  const db = getDb();
  const syncsRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);

  const syncsSnap = await syncsRef.get();

  for (const item of syncsSnap.docs) {
    const data = item.data();
    if (data.metadata.isPaused) {
      console.log(`Sync ${item.id} is paused`);
    }
    await Reservoir.OrderEvents.checkProgress(db, data.metadata.chainId, data.metadata.collection);
  }
}

void main();
