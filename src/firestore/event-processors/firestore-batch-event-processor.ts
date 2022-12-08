import { CollRef } from '../types';
import { FirestoreEventProcessor } from './firestore-event-processor.abstract';

/**
 * FirestoreBatchEventProcessor is best for use cases where each
 * event requires one-time processing and the aggregated data should
 * be reset if re-processing all events is required
 */
export abstract class FirestoreBatchEventProcessor<T> extends FirestoreEventProcessor<T> {
  protected _getEventsForProcessing(eventsRef: CollRef<T>) {
    const unProcessedEvents = this._getUnProcessedEvents(eventsRef);

    /**
     * prevents processing events that were updated after the trigger was marked
     */
    const unProcessedEventsBeforeNow = this._applyUpdatedAtLessThanFilter(unProcessedEvents, Date.now());

    return { query: unProcessedEventsBeforeNow };
  }
}
