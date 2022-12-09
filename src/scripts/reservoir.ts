import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';

import { syncOrderEvents } from '../functions/reservoir/sync-order-events';
import * as Reservoir from '../lib/reservoir';

async function main() {
  const db = getDb();
  await syncOrderEvents(db, Number.MAX_SAFE_INTEGER, {
    pollInterval: 30_000,
    contract: '0xea67b4dd7bacae340bc4e43652044b5cded1963c',
    startTimestamp: 1670599369
  });
}

void main();
