import { getDb } from '@/firestore/db';

import { syncOrderEvents } from '../functions/reservoir/sync-order-events';

async function main() {
  const db = getDb();
  await syncOrderEvents(db, Number.MAX_SAFE_INTEGER, {
    pollInterval: 30_000,
    startTimestamp: 1670599369
  });
}

void main();
