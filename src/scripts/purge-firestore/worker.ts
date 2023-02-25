import { Job } from 'bullmq';
import { ethers } from 'ethers';
import { FieldPath } from 'firebase-admin/firestore';
import 'module-alias/register';

import {
  EventType,
  FeedEvent,
  NftListingEvent,
  NftOfferEvent,
  NftSale,
  NftTransferEvent
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { DocRef } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { logger } from '@/lib/logger';
import { splitQueries } from '@/lib/utils/split-queries';

import {
  CollectionStatsJobData,
  CollectionStatsTriggerJobData,
  CollectionsJobData,
  CollectionsTriggerJobData,
  FeedJobData,
  FirestoreDeletionProcess,
  JobData,
  MarketplaceStatsJobData,
  NftStatsJobData,
  NftStatsTriggerJobData,
  NftsJobData,
  NftsTriggerJobData,
  SocialsStatsJobData,
  SocialsStatsTriggerJobData
} from './process';

export default async function (job: Job<JobData>) {
  const start = Date.now();
  switch (job.data.type) {
    case 'collections-trigger':
      await processCollectionsTriggerJob(job as Job<CollectionsTriggerJobData>);
      break;
    case 'collections':
      await processCollectionsJob(job as Job<CollectionsJobData>);
      break;
    case 'marketplace-stats':
      await processMarketplaceStatsJob(job as Job<MarketplaceStatsJobData>);
      break;
    case 'feed':
      await processFeedJob(job as Job<FeedJobData>);
      break;
    case 'nfts-trigger':
      await processNftsTriggerJob(job as Job<NftsTriggerJobData>);
      break;
    case 'nfts':
      await processNftJob(job as Job<NftsJobData>);
      break;
    case 'collection-stats-trigger':
      await processCollectionStatsTriggerJob(job as Job<CollectionStatsTriggerJobData>);
      break;
    case 'collection-stats':
      await processCollectionStatsJob(job as Job<CollectionStatsJobData>);
      break;
    case 'socials-stats-trigger':
      await processSocialsStatsTriggerJob(job as Job<SocialsStatsTriggerJobData>);
      break;
    case 'socials-stats':
      await processSocialsStatsJob(job as Job<SocialsStatsJobData>);
      break;
    case 'nft-stats-trigger':
      await processNftStatsTriggerJob(job as Job<NftStatsTriggerJobData>);
      break;
    case 'nft-stats':
      await processNftStatsJob(job as Job<NftStatsJobData>);
      break;
  }

  const end = Date.now();
  return {
    timing: {
      created: job.timestamp,
      started: start,
      completed: end
    }
  };
}

export async function processCollectionsTriggerJob(job: Job<CollectionsTriggerJobData>) {
  const db = getDb();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 });

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const queries = splitQueries(collections, job.data.numQueries, 'address');

  for (const query of queries) {
    const collectionsJob: CollectionsJobData = {
      id: `${job.data.id}:${query.min}-${query.max}`,
      type: 'collections',
      numQueries: job.data.numQueries,
      chainId: job.data.chainId,
      min: query.min,
      max: query.max
    };

    await queue.add(collectionsJob);
  }
}

export async function processSocialsStatsTriggerJob(job: Job<SocialsStatsTriggerJobData>) {
  const db = getDb();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 });

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const queries = splitQueries(collections, job.data.numQueries, 'address');

  for (const query of queries) {
    const collectionsJob: SocialsStatsJobData = {
      id: `${job.data.id}:${query.min}-${query.max}`,
      type: 'socials-stats',
      numQueries: job.data.numQueries,
      chainId: job.data.chainId,
      min: query.min,
      max: query.max
    };

    await queue.add(collectionsJob);
  }
}

export async function processNftsTriggerJob(job: Job<NftsTriggerJobData>) {
  const db = getDb();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 });

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const queries = splitQueries(collections, job.data.numQueries, 'address');

  for (const query of queries) {
    const collectionsJob: NftsJobData = {
      id: `${job.data.id}:${query.min}-${query.max}`,
      type: 'nfts',
      numQueries: job.data.numQueries,
      chainId: job.data.chainId,
      min: query.min,
      max: query.max
    };

    await queue.add(collectionsJob);
  }
}

export async function processCollectionStatsTriggerJob(job: Job<CollectionStatsTriggerJobData>) {
  const db = getDb();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 });

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const queries = splitQueries(collections, job.data.numQueries, 'address');

  for (const query of queries) {
    const collectionStatsJob: CollectionStatsJobData = {
      id: `${job.data.id}:${query.min}-${query.max}`,
      type: 'collection-stats',
      numQueries: job.data.numQueries,
      chainId: job.data.chainId,
      min: query.min,
      max: query.max
    };

    await queue.add(collectionStatsJob);
  }
}

export async function processNftStatsTriggerJob(job: Job<NftStatsTriggerJobData>) {
  const db = getDb();

  const queue = new FirestoreDeletionProcess(redis, { concurrency: 0 });

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const queries = splitQueries(collections, job.data.numQueries, 'address');

  for (const query of queries) {
    const collectionStatsJob: NftStatsJobData = {
      id: `${job.data.id}:${query.min}-${query.max}`,
      type: 'nft-stats',
      numQueries: job.data.numQueries,
      chainId: job.data.chainId,
      min: query.min,
      max: query.max
    };

    await queue.add(collectionStatsJob);
  }
}

async function processNftJob(job: Job<NftsJobData>) {
  const db = getDb();
  const min = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.min}/${
    firestoreConstants.COLLECTION_NFTS_COLL
  }/${0}`;
  const max = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.max}/${firestoreConstants.COLLECTION_NFTS_COLL}/${ethers.constants.MaxUint256}`;
  logger.log(job.data.id, `Deleting nfts between ${min} and ${max}`);
  const query = db
    .collectionGroup(firestoreConstants.COLLECTION_NFTS_COLL)
    .where(FieldPath.documentId(), '>=', min)
    .where(FieldPath.documentId(), '<=', max);

  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  let mostRecentlyHandledCollection: DocRef<any>;
  const stream = streamQueryWithRef(query, (ref) => [mostRecentlyHandledCollection ?? ref], { pageSize: 10 });
  const handled = new Set<string>();
  for await (const { ref } of stream) {
    const collectionRef = ref.parent.parent;
    const collectionId = collectionRef?.id;
    if (collectionId && !supportedCollections.has(collectionId) && !handled.has(collectionId)) {
      /**
       * mark as processed so we only handle these once
       */
      handled.add(collectionId);
      /**
       * delete the full nfts sub collection
       */
      await db.recursiveDelete(ref.parent);
      if (collectionRef) {
        mostRecentlyHandledCollection = collectionRef
          .collection(firestoreConstants.COLLECTION_NFTS_COLL)
          .doc(ethers.constants.MaxUint256.toString());
      }
    } else if (collectionId && !handled.has(collectionId)) {
      handled.add(collectionId);
      mostRecentlyHandledCollection = collectionRef
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .doc(ethers.constants.MaxUint256.toString());
    }
  }
}

async function processNftStatsJob(job: Job<NftStatsJobData>) {
  const db = getDb();
  const min = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.min}/nfts/0/nftStats/all`;
  const max = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.max}/nfts/${ethers.constants.MaxUint256}/nftStats/all`;
  logger.log(job.data.id, `Deleting nft stats between ${min} and ${max}`);
  const query = db
    .collectionGroup(`nftStats`)
    .where(FieldPath.documentId(), '>=', min)
    .where(FieldPath.documentId(), '<=', max);

  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  let mostRecentlyHandledItem: DocRef<any>;
  const stream = streamQueryWithRef(query, (ref) => [mostRecentlyHandledItem ?? ref], { pageSize: 300 });
  const handled = new Set<string>();
  for await (const { ref } of stream) {
    const collectionRef = ref.parent.parent?.parent?.parent;
    const collectionId = collectionRef?.id;
    const tokenId = ref.parent.parent?.path;
    if (tokenId && collectionId && !supportedCollections.has(collectionId) && !handled.has(tokenId)) {
      /**
       * mark as processed so we only handle these once
       */
      handled.add(tokenId);
      /**
       * delete the sub collection
       */
      await db.recursiveDelete(ref.parent);
      if (collectionRef) {
        mostRecentlyHandledItem = ref.parent.doc('all');
      }
    } else if (tokenId && collectionId && !handled.has(collectionId)) {
      handled.add(tokenId);
      mostRecentlyHandledItem = ref.parent.doc('all');
    }
  }
}

async function processCollectionStatsJob(job: Job<CollectionStatsJobData>) {
  const db = getDb();
  const min = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.min}/collectionStats/all`;
  const max = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.max}/collectionStats/all`;
  logger.log(job.data.id, `Deleting collection stats between ${min} and ${max}`);
  const query = db
    .collectionGroup(`collectionStats`)
    .where(FieldPath.documentId(), '>=', min)
    .where(FieldPath.documentId(), '<=', max);

  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  let mostRecentlyHandledCollection: DocRef<any>;
  const stream = streamQueryWithRef(query, (ref) => [mostRecentlyHandledCollection ?? ref], { pageSize: 100 });
  const handled = new Set<string>();
  for await (const { ref } of stream) {
    const collectionRef = ref.parent.parent;
    const collectionId = collectionRef?.id;
    if (collectionId && !supportedCollections.has(collectionId) && !handled.has(collectionId)) {
      /**
       * mark as processed so we only handle these once
       */
      handled.add(collectionId);
      /**
       * delete the sub collections
       */
      await db.recursiveDelete(ref.parent);
      const aggregatedCollectionSales = collectionRef.collection(firestoreConstants.AGGREGATED_COLLECTION_SALES_COLL);
      await db.recursiveDelete(aggregatedCollectionSales);
      if (collectionRef) {
        mostRecentlyHandledCollection = collectionRef.collection('collectionStats').doc('all');
      }
    } else if (collectionId && !handled.has(collectionId)) {
      handled.add(collectionId);
      mostRecentlyHandledCollection = collectionRef.collection('collectionStats').doc('all');
    }
  }
}

async function processSocialsStatsJob(job: Job<SocialsStatsJobData>) {
  const db = getDb();
  const min = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.min}/socialsStats/all`;
  const max = `${firestoreConstants.COLLECTIONS_COLL}/${job.data.chainId}:${job.data.max}/socialsStats/all`;
  logger.log(job.data.id, `Deleting socials stats between ${min} and ${max}`);
  const query = db
    .collectionGroup(`socialsStats`)
    .where(FieldPath.documentId(), '>=', min)
    .where(FieldPath.documentId(), '<=', max);

  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  let mostRecentlyHandledCollection: DocRef<any>;
  const stream = streamQueryWithRef(query, (ref) => [mostRecentlyHandledCollection ?? ref], { pageSize: 100 });
  const handled = new Set<string>();
  for await (const { ref } of stream) {
    const collectionRef = ref.parent.parent;
    const collectionId = collectionRef?.id;
    if (collectionId && !supportedCollections.has(collectionId) && !handled.has(collectionId)) {
      /**
       * mark as processed so we only handle these once
       */
      handled.add(collectionId);
      /**
       * delete the sub collections
       */
      await db.recursiveDelete(ref.parent);
      if (collectionRef) {
        mostRecentlyHandledCollection = collectionRef.collection('socialsStats').doc('all');
      }
    } else if (collectionId && !handled.has(collectionId)) {
      handled.add(collectionId);
      mostRecentlyHandledCollection = collectionRef.collection('socialsStats').doc('all');
    }
  }
}

async function processCollectionsJob(job: Job<CollectionsJobData>) {
  const minCollectionId = `${job.data.chainId}:${job.data.min}`;
  const maxCollectionId = `${job.data.chainId}:${job.data.max}`;
  const db = getDb();
  const supportedCollections = new SupportedCollectionsProvider(db);
  await supportedCollections.init();

  const collections = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const query = collections.where('__name__', '>=', minCollectionId).where('__name__', '<=', maxCollectionId);

  const stream = streamQueryWithRef(query);

  for await (const { data, ref } of stream) {
    const aggregatedCollectionSales = ref.collection(firestoreConstants.AGGREGATED_COLLECTION_SALES_COLL);
    const attributesCollection = ref.collection(firestoreConstants.COLLECTION_ATTRIBUTES);
    const collectionStatsCollection = ref.collection(firestoreConstants.COLLECTION_STATS_COLL);
    const collectionV2OrdersCollection = ref.collection('collectionV2Orders');
    const curationCollection = ref.collection(firestoreConstants.COLLECTION_CURATION_COLL);
    const mentionsCollection = ref.collection(firestoreConstants.COLLECTION_MENTIONS_COLL);
    const nftsCollection = ref.collection(firestoreConstants.COLLECTION_NFTS_COLL);
    const socialsStatsCollection = ref.collection(firestoreConstants.COLLECTION_SOCIALS_STATS_COLL);
    if (supportedCollections.has(ref.id) && data.isSupported) {
      logger.log(job.data.id, `Skipping supported collection ${ref.id}`);
    } else if (!supportedCollections.has(ref.id) && !data.isSupported) {
      const subCollections = [
        aggregatedCollectionSales,
        attributesCollection,
        collectionStatsCollection,
        collectionV2OrdersCollection,
        curationCollection,
        mentionsCollection,
        nftsCollection,
        socialsStatsCollection
      ];
      logger.log(job.data.id, `Deleting collection ${ref.id}`);
      const start = Date.now();
      await Promise.all(subCollections.map((subCollection) => db.recursiveDelete(subCollection)));
      const end = Date.now();
      const durationInSeconds = Math.floor((end - start) / 1000);
      logger.log(job.data.id, `Deleted collection ${ref.id} in ${durationInSeconds}s`);
    } else {
      logger.error(job.data.id, `Collection ${ref.id} is in an invalid state`);
    }
  }
}

async function processMarketplaceStatsJob(job: Job<MarketplaceStatsJobData>) {
  const db = getDb();

  const marketplaceStats = db.collection('marketplaceStats');
  logger.log(job.data.id, `Deleting marketplaceStats`);
  const start = Date.now();
  await db.recursiveDelete(marketplaceStats);
  const end = Date.now();
  const durationInSeconds = Math.floor((end - start) / 1000);
  logger.log(job.data.id, `Deleted marketplaceStats in ${durationInSeconds}s`);
}

async function processFeedJob(job: Job<FeedJobData>) {
  const db = getDb();

  const feed = db.collection('feed');

  const query = feed.where('type', '==', job.data.eventTypeToDelete);

  const stream = streamQueryWithRef(query);

  const nftEvents = [EventType.NftListing, EventType.NftOffer, EventType.NftSale, EventType.NftTransfer];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let shouldDelete = (data: FeedEvent) => {
    if (data.timestamp > job.data.keepEventsAfterTimestamp) {
      return false;
    }
    return true;
  };
  if (nftEvents.includes(job.data.eventTypeToDelete)) {
    const supportedCollectionsProvider = new SupportedCollectionsProvider(db);
    await supportedCollectionsProvider.init();
    shouldDelete = (data: FeedEvent) => {
      if (data.timestamp > job.data.keepEventsAfterTimestamp) {
        return false;
      }
      const item = data as any as NftListingEvent | NftOfferEvent | NftSale | NftTransferEvent;
      if (!item.chainId || !item.collectionAddress) {
        return true;
      }

      const id = `${item.chainId}:${item.collectionAddress}`;
      return !supportedCollectionsProvider.has(id);
    };
    logger.log(job.data.id, `Deleting feed events for ${job.data.eventTypeToDelete}`);
  }
  const start = Date.now();

  const batch = new BatchHandler();
  for await (const { ref, data } of stream) {
    if (shouldDelete(data as any)) {
      await batch.deleteAsync(ref);
    }
  }

  await batch.flush();

  const end = Date.now();
  const durationInSeconds = Math.floor((end - start) / 1000);
  logger.log(job.data.id, `Deleted feed events for ${job.data.eventTypeToDelete} in ${durationInSeconds}s`);
}
