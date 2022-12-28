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

  /**
   * whether there are event streams spread across collections
   */
  isCollectionGroup?: boolean;
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
