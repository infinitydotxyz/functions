import { syncSaleEvents } from 'functions/reservoir/sync-sale-events';

import { getDb } from '@/firestore/db';

async function main() {
  const db = getDb();
  await syncSaleEvents(db, 60_000_000, { pollInterval: 3_000, delay: 1_000 }, true);
}

void main();
