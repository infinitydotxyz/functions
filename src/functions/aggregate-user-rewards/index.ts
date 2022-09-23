import { TransactionFeeRewardDoc } from '@infinityxyz/lib/types/core';
import { firestoreConstants, ONE_MIN } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { REGION } from '../../utils/constants';
import { aggregateTransactionFeeRewards } from './aggregate-transaction-fee-rewards';

export const onUserTransactionFeeRewardEvent = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(
    `${firestoreConstants.USERS_COLL}/{userId}/${firestoreConstants.USER_REWARDS_COLL}/{chainId}/${firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL}/{eventId}`
  )
  .onWrite(async (snapshot) => {
    const event = snapshot.after.data() as TransactionFeeRewardDoc;
    if (!event || event.isAggregated) {
      return;
    }

    await aggregateTransactionFeeRewards(
      snapshot.after.ref.parent as FirebaseFirestore.CollectionReference<TransactionFeeRewardDoc>,
      event.chainId,
      event.userAddress
    );
  });

export const triggerUserTransactionFeeRewardAggregation = functions
  .region(REGION)
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
      .orderBy('updatedAt', 'asc');
    const unaggregatedUserRewardsStream = streamQueryWithRef(unaggregatedUserRewardsQuery, (_, ref) => [ref], {
      pageSize: 300
    });

    const triggeredLedgerPaths = new Set();
    const batch = new FirestoreBatchHandler();
    for await (const { ref } of unaggregatedUserRewardsStream) {
      const ledgerRef = ref.parent;
      if (!triggeredLedgerPaths.has(ledgerRef.path)) {
        batch.add(ref, { updatedAt: Date.now() }, { merge: true });
        triggeredLedgerPaths.add(ledgerRef.path);
      }
    }
    await batch.flush();
  });
