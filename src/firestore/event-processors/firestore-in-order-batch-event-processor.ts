import { CollRef, Query, QuerySnap } from '../types';
import { FirestoreEventProcessor } from './firestore-event-processor.abstract';

/**
 * FirestoreInOrderBatchEventProcessor is best for use cases
 * where processing should start at the last unprocessed event
 * and continue with all events in order (including already processed events)
 */
export abstract class FirestoreInOrderBatchEventProcessor<T> extends FirestoreEventProcessor<T> {
  protected async _getEventsForProcessing(ref: CollRef<T>) {
    let query = this._getUnProcessedEvents(ref);
    query = this._applyOrderBy(query, false);

    const firstUnprocessedEventSnap = await query.limit(1).get();

    const startAfterQuery = this._applyOrderBy(ref, true).startAfter(firstUnprocessedEventSnap.docs[0]?.ref);
    const startAfterSnap = await startAfterQuery.limit(1).get();
    const firstStartAfter = startAfterSnap.docs[0];

    const applyStartAfter = (query: Query<T>, lastPageSnap?: QuerySnap<T>) => {
      if (!lastPageSnap) {
        return query.startAfter(firstStartAfter.ref);
      }
      const lastItem = lastPageSnap.docs[lastPageSnap.docs.length - 1];
      return query.startAfter(lastItem.ref);
    };

    return {
      query: this._applyOrderByLessThan(this._applyOrderBy(ref, false), Date.now()),
      applyStartAfter
    };
  }

  protected abstract _applyOrderBy(query: CollRef<T> | Query<T>, reverse?: boolean): Query<T>;

  protected abstract _applyOrderByLessThan(query: CollRef<T> | Query<T>, timestamp: number): Query<T>;
}
