import { FieldPath } from 'firebase-admin/firestore';

import { RewardEvent } from '@infinityxyz/lib/types/core';

import { FirestoreBatchEventProcessor } from '@/firestore/event-processors/firestore-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { RewardsEventHandler } from '@/lib/rewards/rewards-event-handler';

export class RewardsEventProcessor extends FirestoreBatchEventProcessor<RewardEvent> {
  protected _isEventProcessed(event: RewardEvent): boolean {
    return event.isAggregated;
  }

  protected _getUnProcessedEvents(ref: CollRef<RewardEvent> | CollGroupRef<RewardEvent>): Query<RewardEvent> {
    return ref.where('isAggregated', '==', false).where('isMerged', '==', true);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<RewardEvent>,
    timestamp: number
  ): {
    query: Query<RewardEvent>;
    getStartAfterField: (item: RewardEvent, ref: DocRef<RewardEvent>) => (string | number | DocRef<RewardEvent>)[];
  } {
    const q = query
      .where('updatedAt', '<', timestamp)
      .orderBy('updatedAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');

    const getStartAfterField = (item: RewardEvent, ref: DocRef<RewardEvent>) => {
      return [item.updatedAt, ref.id];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(snap: QuerySnap<RewardEvent>, txn: FirebaseFirestore.Transaction): Promise<void> {
    const db = this._getDb();
    const rewardsEventHandler = new RewardsEventHandler(db);

    const items = snap.docs.map((item) => {
      return {
        event: item.data(),
        ref: item.ref
      };
    });

    const firstItem = items.find((item) => !!item?.event?.chainId);
    const chainId = firstItem?.event.chainId;

    if (!chainId) {
      throw new Error(`Failed to find chainId in rewards events`);
    }
    await rewardsEventHandler.onEvents(
      chainId,
      items.map((item) => item.event),
      txn,
      db
    );

    for (const event of items) {
      txn.set(event.ref, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
    }
  }
}
