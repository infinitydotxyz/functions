import { FieldPath } from 'firebase-admin/firestore';

import { FirestoreBatchEventProcessor } from '@/firestore/event-processors/firestore-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';

import { Referral, ReferralCode, ReferralRewards } from './types';

export class ReferralsProcessor extends FirestoreBatchEventProcessor<Referral> {
  protected _isEventProcessed(event: Referral): boolean {
    return event.processed;
  }

  protected _getUnProcessedEvents(ref: CollRef<Referral> | CollGroupRef<Referral>): Query<Referral> {
    return ref.where('processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<Referral>,
    timestamp: number
  ): {
    query: Query<Referral>;
    getStartAfterField: (
      item: Referral,
      ref: FirebaseFirestore.DocumentReference<Referral>
    ) => (string | number | FirebaseFirestore.DocumentReference<Referral>)[];
  } {
    const q = query
      .where('createdAt', '<', timestamp)
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');

    const getStartAfterField = (item: Referral, ref: DocRef<Referral>) => {
      return [item.createdAt, ref.path];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    events: QuerySnap<Referral>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<Referral>
  ): Promise<void> {
    /**
     * Count the number of referrals for the user
     */

    const referralRef = eventsRef.parent as DocRef<ReferralCode> | undefined;

    if (!referralRef) {
      throw new Error(`Failed to get parent ref for ${eventsRef.path}`);
    }

    const referralDocSnap = await referralRef.get();

    const referralDoc = referralDocSnap.data();

    if (!referralDoc) {
      throw new Error(`Failed to get referral doc for ${referralRef.path}`);
    }

    const { owner } = referralDoc;

    const referralRewardsRef = this.db
      .collection('flowBetaReferralRewards')
      .doc(owner.address) as DocRef<ReferralRewards>;
    const referralRewardsSnap = await txn.get(referralRewardsRef);
    const referralRewards = referralRewardsSnap.data() ?? {
      numberOfReferrals: 0
    };

    for (const event of events.docs) {
      referralRewards.numberOfReferrals += 1;
      txn.set(event.ref, { processed: true }, { merge: true });
    }
    txn.set(referralRewardsRef, referralRewards, { merge: true });
  }
}
