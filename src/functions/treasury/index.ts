import * as functions from 'firebase-functions';

import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';

import { TreasuryBalanceAddedEvent } from '../../rewards/trading-fee-program-handlers/treasury-handler';
import { aggregatedTreasuryEvents } from './aggregate-treasury-events';

export const onTreasuryLedgerEvent = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540,
    maxInstances: 1 // run 1 instance to support batch aggregation on any event change
  })
  .firestore.document(
    `${firestoreConstants.TREASURY_COLL}/{chainId}/${firestoreConstants.TREASURY_LEDGER_COLL}/{treasuryLedgerEvent}`
  )
  .onWrite(async (snapshot) => {
    const ledgerRef = snapshot.after.ref.parent as FirebaseFirestore.CollectionReference<TreasuryBalanceAddedEvent>;
    await aggregatedTreasuryEvents(ledgerRef);
  });

export const triggerTreasuryLedgerAggregation = functions
  .region(config.firebase.region)
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const db = getDb();

    const treasuryLedgersRef = db.collectionGroup(
      firestoreConstants.TREASURY_LEDGER_COLL
    ) as FirebaseFirestore.CollectionGroup<TreasuryBalanceAddedEvent>;

    const maxAge = ONE_MIN * 5;
    const query = treasuryLedgersRef.where('isAggregated', '==', false).where('updatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });

    const paths = new Set<string>();
    const batch = new BatchHandler();
    for await (const { ref } of stream) {
      if (!paths.has(ref.parent.path)) {
        paths.add(ref.parent.path);
        await batch.addAsync(ref, { updatedAt: Date.now() }, { merge: true });
      }
    }
    await batch.flush();
  });
