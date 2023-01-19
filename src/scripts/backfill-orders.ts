import { ChainId } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { backfillActiveListings } from '@/lib/reservoir/order-events/backfill-active-orders';

async function main() {
  const db = getDb();
  await backfillActiveListings(ChainId.Mainnet, '0x60e4d786628fea6478f785a6d7e704777c86a7c6'.toLowerCase(), db);
}

void main();
