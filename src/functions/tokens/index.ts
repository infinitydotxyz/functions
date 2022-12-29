import * as functions from 'firebase-functions';

import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';
import { TokenTransfersProcessor } from '@/lib/tokens/transfers/token-transfers-processor';

const transferProcessor = new TokenTransfersProcessor(
  {
    docBuilderCollectionPath: `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_NFTS_COLL}/{tokenId}/nftTransferEvents`,
    batchSize: 300,
    maxPages: 3,
    minTriggerInterval: ONE_MIN,
    id: 'processor',
    isCollectionGroup: true
  },
  {
    schedule: 'every 2 minutes',
    tts: ONE_MIN
  },
  getDb,
  true
);

const processor = transferProcessor.getFunctions();

const settings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 540,
  maxInstances: 10_000
});

const documentBuilder = settings.firestore.document;
const scheduleBuilder = settings.pubsub.schedule;

export const onProcessTransferEvent = processor.onEvent(documentBuilder);
export const onProcessTransferEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
export const onProcessTransferEventProcess = processor.process(documentBuilder);
export const onProcessTransferEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);
