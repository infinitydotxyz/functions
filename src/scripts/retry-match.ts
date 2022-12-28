import { FirestoreOrderMatchStatus, FirestoreOrderMatches } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';

export async function retryMatch(matchId: string) {
  const db = getDb();
  const matchRef = db.collection(firestoreConstants.ORDER_MATCHES_COLL).doc(matchId);
  const snap = await matchRef.get();
  const match = snap.data() as FirestoreOrderMatches;
  if (!match) {
    throw new Error(`No match found for id ${matchId}`);
  }
  if (match.state.status === FirestoreOrderMatchStatus.Error) {
    await matchRef.set(
      {
        state: {
          status: FirestoreOrderMatchStatus.Inactive
        }
      },
      { merge: true }
    );

    console.log(`Set match to inactive: ${matchId}`);
  } else {
    console.log('match not in error state');
    console.log(`Match State ${JSON.stringify(match.state, null, 2)}`);
  }
}

void retryMatch('1b9f604fa78a86cf9a0b28eb5d786bf0d4a4ef12f32d3c6151e6692ce04d86b0');
