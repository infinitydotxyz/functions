import * as functions from 'firebase-functions';

import { UserRewardsEventDoc } from '@infinityxyz/lib/types/core';
import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollGroupRef, CollRef } from '@/firestore/types';

import { aggregateTransactionFeeRewards } from './aggregate-transaction-fee-rewards';

export const onUserTransactionFeeRewardEvent = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.USERS_COLL}/{userId}/${firestoreConstants.USER_REWARDS_COLL}/{chainId}/${firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL}/{eventId}`
  ) // TODO this causes some contention and could be restructured to not cause errors
  .onWrite(async (snapshot) => {
    const event = snapshot.after.data() as UserRewardsEventDoc;
    if (!event || event.isAggregated) {
      return;
    }

    await aggregateTransactionFeeRewards(
      snapshot.after.ref.parent as CollRef<UserRewardsEventDoc>,
      event.chainId,
      event.userAddress
    );
  });

export const triggerUserTransactionFeeRewardAggregation = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const db = getDb();
    const maxAge = ONE_MIN * 5;
    const unaggregatedUserRewardsQuery = db
      .collectionGroup(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL)
      .where('isAggregated', '==', false)
      .where('updatedAt', '<', Date.now() - maxAge)
      .orderBy('updatedAt', 'asc') as CollGroupRef<UserRewardsEventDoc>;
    const unaggregatedUserRewardsStream = streamQueryWithRef(unaggregatedUserRewardsQuery, (_, ref) => [ref], {
      pageSize: 300
    });

    const triggeredLedgerPaths = new Set();
    const batch = new BatchHandler();
    for await (const { ref } of unaggregatedUserRewardsStream) {
      const ledgerRef = ref.parent;
      if (!triggeredLedgerPaths.has(ledgerRef.path)) {
        batch.add(ref, { updatedAt: Date.now() }, { merge: true });
        triggeredLedgerPaths.add(ledgerRef.path);
      }
    }
    await batch.flush();
  });
