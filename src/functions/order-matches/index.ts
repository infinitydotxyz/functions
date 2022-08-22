import { FirestoreOrderMatches, FirestoreOrderMatchStatus } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { REGION } from '../../utils/constants';
import { sendOrderMatchWebhook } from './order-match-webhook';

export const onOrderMatch = functions
  .region(REGION)
  .firestore.document(`${firestoreConstants.ORDER_MATCHES_COLL}/matchId`)
  .onWrite(async (change) => {
    const before = change.before.data() as FirestoreOrderMatches | undefined;
    const orderMatch = change.after.data() as FirestoreOrderMatches;
    const wasNotMatchedBefore = before?.state?.status !== FirestoreOrderMatchStatus.Matched;
    const isMatched = orderMatch?.state?.status === FirestoreOrderMatchStatus.Matched;
    if (wasNotMatchedBefore && isMatched) {
      const url = process.env.ORDER_MATCH_WEBHOOK_URL;
      if (url) {
        await sendOrderMatchWebhook(url, orderMatch);
      }
    }
  });
