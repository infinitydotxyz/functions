import { OrderDirection } from '@infinityxyz/lib/types/core';

import { CollRef, DocRef, Query, QuerySnap } from '../types';
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
    const unProcessedEvents = this._getUnProcessedEvents(ref);
    const { query } = this._applyOrderBy(unProcessedEvents, OrderDirection.Ascending);

    const firstUnprocessedEventSnap = await query.limit(1).get();
    const firstDoc = firstUnprocessedEventSnap.docs[0];
    const firstDocData = firstDoc?.data?.() as T | undefined;

    let firstStartAfterItem:
      | {
          ref: DocRef<T>;
          data: T;
        }
      | undefined;
    if (firstDocData) {
      /**
       * get the event before the first unprocessed event (if any)
       */
      const orderByRes = this._applyOrderBy(ref, OrderDirection.Descending);
      let startAfterQuery = orderByRes.query;
      startAfterQuery = startAfterQuery.startAfter(orderByRes.getStartAfterField(firstDocData, firstDoc.ref));
      const startAfterSnap = await startAfterQuery.limit(1).get();
      const firstStartAfterDoc = startAfterSnap.docs[0];
      const firstStartAfterDocData = firstStartAfterDoc?.data?.() as T | undefined;

      if (firstStartAfterDocData) {
        firstStartAfterItem = {
          ref: firstStartAfterDoc.ref,
          data: firstStartAfterDocData
        };
      }
    }

    let pageNumber = 0;

    const { query: eventsForProcessingQuery, getStartAfterField } = this._applyOrderBy(
      this._applyOrderByLessThan(ref, Date.now()),
      OrderDirection.Ascending
    );
    const applyStartAfter = (query: Query<T>, lastPageSnap?: QuerySnap<T>) => {
      pageNumber += 1;
      /**
       * if we are about to get the first page
       * and we found a document before the first unprocessed event
       */
      if (!lastPageSnap && firstStartAfterItem) {
        if (pageNumber !== 1) {
          console.error(`Expected page number to be 1!`);
        }
        return query.startAfter(firstStartAfterItem.ref);
      } else if (!lastPageSnap && !firstStartAfterItem) {
        /**
         * if we are about to get the first page and
         * we did not find a document before the first unprocessed event
         */
        if (pageNumber !== 1) {
          console.error(`Expected page number to be 1!`);
        }
        return query;
      } else if (lastPageSnap) {
        const lastItem = lastPageSnap.docs[lastPageSnap.docs.length - 1];
        const lastItemData = lastItem?.data?.();
        if (lastItem && lastItemData) {
          const startAfter = getStartAfterField(lastItemData, lastItem?.ref);
          return query.startAfter(startAfter);
        }

        return undefined;
      }
      // no more events to process
      return undefined;
    };

    return {
      query: eventsForProcessingQuery,
      applyStartAfter
    };
  }

  protected abstract _applyOrderBy(
    query: CollRef<T> | Query<T>,
    direction: OrderDirection
  ): {
    query: Query<T>;
    getStartAfterField: (
      item: T,
      ref: FirebaseFirestore.DocumentReference<T>
    ) => (string | number | FirebaseFirestore.DocumentReference<T>)[];
  };

  protected abstract _applyOrderByLessThan(query: CollRef<T> | Query<T>, timestamp: number): Query<T>;
}
