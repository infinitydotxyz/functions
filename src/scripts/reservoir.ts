import { ChainId } from '@infinityxyz/lib/types/core';
import * as Reservoir from '../reservoir';
import { getDb } from '../firestore';
import { syncOrderEvents } from '../functions/reservoir/sync-order-events';

async function main() {
  const db = getDb();
  //   await syncOrderEvents(db, 20_000);
}

void main();
