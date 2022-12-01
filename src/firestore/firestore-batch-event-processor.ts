import { firestore, pubsub } from 'firebase-functions';
import { paginatedTransaction } from './paginated-transaction';
import { streamQueryWithRef } from './stream-query';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from './types';

export interface EventProcessorConfig {
  /**
   * a path to the collection of events to process
   * uses the same syntax as defining a function listener
   */
  docBuilderCollectionPath: string;

  /**
   * size of the batch of events that will be processed
   * - firestore supports a max of 500 writes per transaction
   * so this should be set according to the number of writes
   * you are expecting to perform
   *
   * the processor also requires 1 write per page
   */
  batchSize: number;

  /**
   * max number of pages to process
   * - set it to something reasonable to avoid a bug causing
   * an expensive infinite loop of reads and writes, and increase
   * it as more scalability is required
   */
  maxPages: number;

  /**
   * ms to wait between triggering event processing
   */
  minTriggerInterval: number;

  /**
   * an optional id to support multiple triggers for the same collection
   */
  id?: string;
}

/**
 * Backup options provides
 */
export interface BackupOptions {
  /**
   * a schedule to query for unprocessed events and trigger processing
   * - Both Unix Crontab and App Engine syntax are supported
   * https://firebase.google.com/docs/functions/schedule-functions
   */
  schedule: string;

  /**
   * time to stale applied to unprocessed events query to determine if
   * they were missed during processing
   */
  tts: number;
}

export interface TriggerDoc {
  id: string;
  requiresProcessing: boolean;
  lastProcessedAt: number;
  updatedAt: number;
}

/**
 * FirestoreBatchEventProcessor provides the boilerplate code for implementing
 * a scalable, transaction based, event-driven architecture for an event stream
 * where each event requires one-time processing and the aggregated data should
 * be reset if re-processing all events is required
 *
 *
 * given a path to a collection of events, the processor will create the following
 * ...
 *   {<collectionName>}
 *      {eventId}
 *   {_<collectionName>} // contains triggers for processing events collection
 *      _trigger:<collectionName>
 */
export abstract class FirestoreBatchEventProcessor<T> {
  readonly collectionName: string;
  protected readonly _docBuilderCollectionParentPath: string;

  get triggerCollectionId() {
    return `_${this.collectionName}`;
  }

  protected get _triggerDocId() {
    return `_trigger:${this.collectionName}${this._config.id ? ':' + this._config.id : ''}`;
  }

  get docBuilderTriggerDocPath() {
    return [this._docBuilderCollectionParentPath, this.triggerCollectionId, this._triggerDocId].join('/');
  }

  constructor(
    protected _config: EventProcessorConfig,
    protected _backupOptions: BackupOptions,
    protected _getDb: () => FirebaseFirestore.Firestore
  ) {
    this.collectionName = this.getCollectionName();
    this._docBuilderCollectionParentPath = this.getCollectionParentPath();
  }

  /**
   * _isEventProcessed takes an event and determines if it has been processed
   */
  protected abstract _isEventProcessed(event: T): boolean;

  /**
   * _getUnProcessedEvents takes a reference to the collection of events
   * being handled and applies where clauses such that only unprocessed
   * events are returned
   */
  protected abstract _getUnProcessedEvents(ref: CollRef<T> | CollGroupRef<T>): Query<T>;

  /**
   * _applyUpdatedAtLessThanFilter takes a query of events and applies a 
   * where clause to filter out events that have been updated after the 
   * provided timestamp
   */
  protected abstract _applyUpdatedAtLessThanFilter(query: Query<T>, timestamp: number): Query<T>;

  /**
   * _processEvents takes a page of events and a transaction and is expected
   * to process the events such that the events are included in any aggregated
   * views and events are marked as processed according to the _getUnProcessedEvents
   * query
   */
  protected abstract _processEvents(
    events: QuerySnap<T>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<T>
  ): Promise<void>;

  /**
   * getFunctions returns cloud functions that should be registered with firebase
   */
  getFunctions() {
    return {
      onEvent: this._onEvent.bind(this),
      scheduledBackupEvents: this._scheduleBackupEvents.bind(this),
      process: this._onProcessTrigger.bind(this),
      scheduledBackupTrigger: this._scheduleBackupTrigger.bind(this)
    };
  }

  /**
   * _onEvent is called when an event changes in the collection
   * and updates the trigger document to initiate processing
   */
  protected _onEvent(document: (path: string) => firestore.DocumentBuilder) {
    return document(`${this._config.docBuilderCollectionPath}/{eventDoc}`).onWrite(async (change) => {
      const ref = change.after.ref as FirebaseFirestore.DocumentReference<T>;
      const data = change.after.data() as T | undefined;
      if (!data) {
        return;
      }
      const isProcessed = this._isEventProcessed(data);
      if (!isProcessed) {
        await this._initiateProcessing(ref);
      }
    });
  }

  /**
   * _scheduleBackupEvents runs on a schedule to catch any events that
   * are missed/skipped during processing and re-initiates processing
   */
  protected _scheduleBackupEvents(schedule: (schedule: string) => pubsub.ScheduleBuilder) {
    return schedule(this._backupOptions.schedule).onRun(async () => {
      const db = this._getDb();

      const eventsRef = db.collectionGroup(this.collectionName) as CollGroupRef<T>;

      const unProcessedEvents = this._getUnProcessedEvents(eventsRef);
      const staleIfUpdatedBefore = Date.now() - this._backupOptions.tts;
      const staleUnProcessedEvents = this._applyUpdatedAtLessThanFilter(unProcessedEvents, staleIfUpdatedBefore).limit(1);

      const snapshot = await staleUnProcessedEvents.get();
      const item = snapshot.docs.find((item) => !!item);

      if (item) {
        await this._initiateProcessing(item.ref);
      }
    });
  }

  /**
   * _scheduleBackupTrigger runs on a schedule to catch any triggers that
   * are missed/skipped
   */
  protected _scheduleBackupTrigger(schedule: (schedule: string) => pubsub.ScheduleBuilder) {
    return schedule(this._backupOptions.schedule).onRun(async () => {
      const db = this._getDb();

      const triggersRequiringProcessing = db
        .collectionGroup(this.triggerCollectionId)
        .where('id', '==', this._triggerDocId)
        .where('requiresProcessing', '==', true) as CollGroupRef<TriggerDoc>;

      const staleIfUpdatedBefore = Date.now() - this._backupOptions.tts;
      const staleTriggersRequiringProcessing = triggersRequiringProcessing.where(
        'updatedAt',
        '<',
        staleIfUpdatedBefore
      );

      const stream = streamQueryWithRef(staleTriggersRequiringProcessing);

      for await (const item of stream) {
        if (item.data) {
          await this._triggerProcessing(item.ref, item.data);
        }
      }
    });
  }

  /**
   * _onProcessTrigger runs when the trigger document changes and initiates
   * processing for events in the collection
   *
   * processing is done using transaction batches via `paginatedTransaction` helper
   * - make sure you are familiar with the constraints of this helper before
   * implementing the `_processEvents` method
   */
  protected _onProcessTrigger(document: (path: string) => firestore.DocumentBuilder) {
    return document(this.docBuilderTriggerDocPath).onWrite(async (change) => {
      const ref = change.after.ref as FirebaseFirestore.DocumentReference<TriggerDoc>;
      const data = change.after.data() as TriggerDoc | undefined;
      if (!data) {
        return;
      }

      if (data.requiresProcessing) {
        let wasMarked = false;
        const markAsProcessed = async (ref: DocRef<TriggerDoc>, txn?: FirebaseFirestore.Transaction) => {
          if (wasMarked) {
            return;
          }
          const update: Partial<TriggerDoc> = {
            requiresProcessing: false,
            lastProcessedAt: Date.now(),
            updatedAt: Date.now()
          };

          if (txn) {
            txn.set(ref, update, { merge: true });
          } else {
            await ref.set(update, { merge: true });
          }
          wasMarked = true;
        };

        const eventsRef = ref.parent.parent?.collection(this.collectionName) as CollRef<T>;
        if (!eventsRef) {
          throw new Error(`Failed to process events. Events ref not found`);
        }
        const unProcessedEvents = this._getUnProcessedEvents(eventsRef);

        /**
         * prevents processing events that were updated after the trigger was marked
         */
        const unProcessedEventsBeforeNow = this._applyUpdatedAtLessThanFilter(unProcessedEvents, Date.now());

        const res = await paginatedTransaction(
          unProcessedEventsBeforeNow,
          ref.firestore,
          { pageSize: this._config.batchSize, maxPages: this._config.maxPages },
          async ({ data, txn, hasNextPage }) => {
            await this._processEvents(data, txn, eventsRef);
            if (!hasNextPage) {
              await markAsProcessed(ref, txn);
            }
          }
        );

        if (res.queryEmpty) {
          await markAsProcessed(ref);
        }
      }
    });
  }

  /**
   * _initiateProcessing updates the trigger document to initiate
   * processing of events in the collection
   */
  protected async _initiateProcessing(docRef: DocRef<T>) {
    const collRef = docRef.parent.parent?.collection(`_${this.collectionName}`);
    if (!collRef) {
      throw new Error('failed to get collection ref');
    }

    const triggerRef = collRef.doc(this._triggerDocId) as DocRef<TriggerDoc>;
    const triggerDoc = await triggerRef.get();
    const data = triggerDoc.data();
    await this._triggerProcessing(triggerRef, data);
  }

  protected async _triggerProcessing(triggerRef: DocRef<TriggerDoc>, trigger?: TriggerDoc) {
    if (!trigger) {
      const defaultTrigger: TriggerDoc = {
        id: this._triggerDocId,
        requiresProcessing: true,
        lastProcessedAt: 0,
        updatedAt: Date.now()
      };
      await triggerRef.set(defaultTrigger, { merge: true });
      return;
    }

    const exceedsMinTriggerInterval = trigger.updatedAt < Date.now() - this._config.minTriggerInterval;
    if (exceedsMinTriggerInterval && !trigger.requiresProcessing) {
      await triggerRef.set({ updatedAt: Date.now(), requiresProcessing: true }, { merge: true });
    }
  }

  protected getCollectionName() {
    const parts = this._config.docBuilderCollectionPath.split('/');
    const collectionName = parts[parts.length - 1];
    if (parts.length % 2 === 0) {
      throw new Error('collectionPath must be the path to a collection not a document');
    }
    if (!collectionName) {
      throw new Error('collectionPath invalid. failed to extract collection name');
    }
    return collectionName;
  }

  protected getCollectionParentPath() {
    const parts = this._config.docBuilderCollectionPath.split('/');
    const collectionPath = parts.pop();
    if (!collectionPath) {
      throw new Error(
        `collectionPath invalid. failed to extract collection parent path from ${this._config.docBuilderCollectionPath}`
      );
    }

    return parts.join('/');
  }
}
