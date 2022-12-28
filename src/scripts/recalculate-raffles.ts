import { EntrantLedgerItem, RaffleEntrant } from '@infinityxyz/lib/types/core';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';

import { streamQueryWithRef } from '../firestore/stream-query';

async function recalculateRaffles() {
  const db = getDb();
  const raffleEntrants = db.collectionGroup('raffleEntrants') as FirebaseFirestore.CollectionGroup<RaffleEntrant>;
  const raffleEntrantsStream = streamQueryWithRef(raffleEntrants, (_, ref) => [ref], { pageSize: 300 });

  const batch = new BatchHandler();
  for await (const raffleEntrant of raffleEntrantsStream) {
    raffleEntrant.data.numTickets = 0;
    raffleEntrant.data.data = {
      volumeUSDC: 0,
      numValidListings: 0,
      numTicketsFromOffers: 0,
      numTicketsFromVolume: 0,
      numValidOffers: 0,
      numTicketsFromListings: 0
    };

    await batch.addAsync(raffleEntrant.ref, raffleEntrant.data, { merge: true });
  }

  await batch.flush();

  const raffleEntrantLedgers = db.collectionGroup(
    'raffleEntrantLedger'
  ) as FirebaseFirestore.CollectionGroup<EntrantLedgerItem>;

  const stream = streamQueryWithRef(raffleEntrantLedgers, (_, ref) => [ref], { pageSize: 300 });

  for await (const { ref } of stream) {
    await batch.addAsync(ref, { isAggregated: false }, { merge: true });
  }

  await batch.flush();
}

void recalculateRaffles();
