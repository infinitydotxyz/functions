import { RewardEvent } from '@infinityxyz/lib/types/core';
import { FirestoreBatchEventProcessor } from '../../firestore/firestore-batch-event-processor';
import { CollRef, CollGroupRef, Query, QuerySnap } from '../../firestore/types';
import { RewardsEventHandler } from '../../rewards/rewards-event-handler';

export class RewardsEventProcessor extends FirestoreBatchEventProcessor<RewardEvent> {
  protected _isEventProcessed(event: RewardEvent): boolean {
    return event.isAggregated;
  }

  protected _getUnProcessedEvents(ref: CollRef<RewardEvent> | CollGroupRef<RewardEvent>): Query<RewardEvent> {
    return ref.where('isAggregated', '==', false).where('isMerged', '==', true);
  }

  protected _applyUpdatedAtLessThanFilter(query: Query<RewardEvent>, timestamp: number): Query<RewardEvent> {
    return query.where('updatedAt', '<',timestamp);
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
