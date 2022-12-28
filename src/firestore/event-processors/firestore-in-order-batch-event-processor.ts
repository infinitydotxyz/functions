import { OrderDirection } from '@infinityxyz/lib/types/core';

import { CollRef, Query, QuerySnap } from '../types';
import { FirestoreEventProcessor } from './firestore-event-processor.abstract';

/**
 * FirestoreInOrderBatchEventProcessor is best for use cases
 * where processing should start at the last unprocessed event
 * and continue with all events in order (including already processed events)
 */
export abstract class FirestoreInOrderBatchEventProcessor<T> extends FirestoreEventProcessor<T> {
  protected async _getEventsForProcessing(ref: CollRef<T>) {
    /**
     * get the first unprocessed event
     */
    let query = this._getUnProcessedEvents(ref);
    query = this._applyOrderBy(query, OrderDirection.Ascending);

    const firstUnprocessedEventSnap = await query.limit(1).get();
    const firstRef = firstUnprocessedEventSnap.docs[0]?.ref;
    /**
     * get the event before the first unprocessed event
     */
    let startAfterQuery = this._applyOrderBy(ref, OrderDirection.Descending);
    if (firstRef) {
      startAfterQuery = startAfterQuery.startAfter(firstRef);
    }
    const startAfterSnap = await startAfterQuery.limit(1).get();
    const firstStartAfter = startAfterSnap.docs[0];

    const applyStartAfter = (query: Query<T>, lastPageSnap?: QuerySnap<T>) => {
      /**
       * if we are about to get the first page
       * and we found a document before the first unprocessed event
       */
      if (!lastPageSnap && firstStartAfter) {
        return query.startAfter(firstStartAfter.ref);
      } else if (!lastPageSnap && !firstStartAfter) {
        /**
         * if we are about to get the first page and
         * we did not find a document before the first unprocessed event
         */
        if (firstRef) {
          return query;
        }
        // no events to process
        return undefined;
      } else if (lastPageSnap) {
        const lastItem = lastPageSnap.docs[lastPageSnap.docs.length - 1];
        if (lastItem) {
          return query.startAfter(lastItem.ref);
        }
      }
      // no more events to process
      return undefined;
    };

    return {
      query: this._applyOrderByLessThan(this._applyOrderBy(ref, OrderDirection.Ascending), Date.now()),
      applyStartAfter
    };
  }

  protected abstract _applyOrderBy(query: CollRef<T> | Query<T>, direction: OrderDirection): Query<T>;

  protected abstract _applyOrderByLessThan(query: CollRef<T> | Query<T>, timestamp: number): Query<T>;
}
