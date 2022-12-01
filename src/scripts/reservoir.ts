import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { syncOrderEvents } from '../functions/reservoir/sync-order-events';
import * as Reservoir from '../lib/reservoir';

async function main() {
  const db = getDb();
  await syncOrderEvents(db, 20_000);
}

void main();
