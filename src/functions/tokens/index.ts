import * as functions from 'firebase-functions';

import { ONE_MIN, firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';

// import { TokenTransfersProcessor } from '@/lib/tokens/transfers/token-transfers-processor';
import { NftSalesProcessor } from './nft-sale-processor';

// const transferProcessor = new TokenTransfersProcessor(
//   {
//     docBuilderCollectionPath: `${firestoreConstants.COLLECTIONS_COLL}/{collectionId}/${firestoreConstants.COLLECTION_NFTS_COLL}/{tokenId}/nftTransferEvents`,
//     batchSize: 300,
//     maxPages: 3,
//     minTriggerInterval: ONE_MIN,
//     id: 'processor',
//     isCollectionGroup: true
//   },
//   {
//     schedule: 'every 5 minutes',
//     tts: 5 * ONE_MIN
//   },
//   getDb,
//   true
// );

// const processor = transferProcessor.getFunctions();

const documentSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 60
});

const scheduleSettings = functions.region(config.firebase.region).runWith({
  timeoutSeconds: 5 * 60 - 5,
  maxInstances: 1
});

const documentBuilder = documentSettings.firestore.document;
const scheduleBuilder = scheduleSettings.pubsub.schedule;

// export const onProcessTransferEvent = processor.onEvent(documentBuilder);
// export const onProcessTransferEventBackup = processor.scheduledBackupEvents(scheduleBuilder);
// export const onProcessTransferEventProcess = processor.process(
//   functions.region(config.firebase.region).runWith({
//     timeoutSeconds: 60,
//     maxInstances: 5000,
//     minInstances: 2
//   }).firestore.document
// );
// export const onProcessTransferEventProcessBackup = processor.scheduledBackupTrigger(scheduleBuilder);

const nftSalesProcessor = new NftSalesProcessor(
  {
    docBuilderCollectionPath: `${firestoreConstants.COLLECTIONS_COLL}/{collId}/${firestoreConstants.COLLECTION_NFTS_COLL}/{tokenId}/nftSaleEvents`,
    batchSize: 200,
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
const nftSalesProcessorFns = nftSalesProcessor.getFunctions();

export const onProcessNftSaleEvent = nftSalesProcessorFns.onEvent(documentBuilder);
export const onProcessNftSaleEventBackup = nftSalesProcessorFns.scheduledBackupEvents(scheduleBuilder);
export const onProcessNftSaleEventProcess = nftSalesProcessorFns.process(
  functions.region(config.firebase.region).runWith({
    timeoutSeconds: 60,
    maxInstances: 3000,
    minInstances: 1
  }).firestore.document
);
export const onProcessNftSaleEventProcessBackup = nftSalesProcessorFns.scheduledBackupTrigger(scheduleBuilder);
