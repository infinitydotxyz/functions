import PQueue from 'p-queue';

import { BaseCollection, DiscordAnnouncementEvent, EventType, TwitterTweetEvent } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';

import { streamQueryWithRef } from '../firestore/stream-query';

async function main() {
  const db = getDb();
  const feed = db.collection(firestoreConstants.FEED_COLL);

  await lowercaseFeedTweetUsernames();
  console.log('Lowercased tweet usernames');
  await lowercaseCollectionTwitterUsernames();
  console.log('Lowercased collection twitter usernames');

  const discordAnnouncementsQuery = feed
    .where('type', '==', EventType.DiscordAnnouncement)
    .limit(1) as FirebaseFirestore.Query<DiscordAnnouncementEvent>;
  const tweetsQuery = feed
    .where('type', '==', EventType.TwitterTweet)
    .limit(1) as FirebaseFirestore.Query<TwitterTweetEvent>;

  const tweetsStream = streamQueryWithRef(tweetsQuery);

  const queue = new PQueue({ concurrency: 100 });

  const batchHandler = new BatchHandler();
  for await (const item of tweetsStream) {
    queue
      .add(async () => {
        console.log(`Migrating ${item.data.type} event ${item.ref.id}`);
        await migrateTweet(item.data, item.ref, batchHandler);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  await queue.onIdle();

  const discordAnnouncementsStream = streamQueryWithRef(discordAnnouncementsQuery);
  for await (const item of discordAnnouncementsStream) {
    queue
      .add(async () => {
        console.log(`Migrating ${item.data.type} event ${item.ref.id}`);
        await migrateDiscordAnnouncement(item.data, item.ref, batchHandler);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  await queue.onIdle();

  await batchHandler.flush();
}

async function lowercaseFeedTweetUsernames() {
  const db = getDb();
  const feed = db.collection(firestoreConstants.FEED_COLL);

  const tweetsQuery = feed.where('type', '==', EventType.TwitterTweet) as FirebaseFirestore.Query<TwitterTweetEvent>;

  const tweetsStream = streamQueryWithRef(tweetsQuery);

  const batchHandler = new BatchHandler();
  for await (const item of tweetsStream) {
    const username = item.data?.username?.toLowerCase();
    if (username) {
      await batchHandler.addAsync(item.ref, { username }, { merge: true });
    }
  }

  await batchHandler.flush();
}

async function lowercaseCollectionTwitterUsernames() {
  const db = getDb();
  const collections = db.collection(
    firestoreConstants.COLLECTIONS_COLL
  ) as FirebaseFirestore.CollectionReference<BaseCollection>;

  const collectionsStream = streamQueryWithRef(collections);

  const batchHandler = new BatchHandler();
  for await (const item of collectionsStream) {
    const username = item.data?.metadata?.links?.twitter?.toLowerCase();
    if (username) {
      const update = {
        ...(item.data?.metadata ?? {}),
        links: {
          ...(item.data?.metadata?.links ?? {}),
          twitter: username
        }
      };
      await batchHandler.addAsync(item.ref, { metadata: update }, { merge: true });
    }
  }

  await batchHandler.flush();
}

async function migrateTweet(
  tweet: TwitterTweetEvent,
  ref: FirebaseFirestore.DocumentReference<TwitterTweetEvent>,
  batch: BatchHandler
) {
  const collRef = ref.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
  const username = tweet.username?.toLowerCase();
  if (username) {
    const query = collRef.where('metadata.links.twitter', '==', `https://twitter.com/${username}`);

    let snapshot = await query.where('hasBlueCheck', '==', true).limit(1).get();
    if (snapshot.size === 0) {
      snapshot = await query.limit(1).get();
    }

    const doc = snapshot.docs[0];

    if (doc) {
      const data = doc.data() as BaseCollection;
      if (data.address) {
        await batch.addAsync(
          ref,
          {
            collectionAddress: data.address,
            collectionName: data.metadata?.name,
            collectionSlug: data.slug,
            collectionProfileImage: data.metadata?.profileImage,
            chainId: data.chainId,
            hasBlueCheck: data.hasBlueCheck ?? false
          },
          { merge: true }
        );
      }
    } else {
      console.log(`No collection found for ${username}`);
    }
  } else {
    console.log('No username found for tweet', tweet.id);
  }
}

async function migrateDiscordAnnouncement(
  announcement: DiscordAnnouncementEvent,
  ref: FirebaseFirestore.DocumentReference<DiscordAnnouncementEvent>,
  batch: BatchHandler
) {
  const collRef = ref.firestore.collection(firestoreConstants.COLLECTIONS_COLL);
  const guildId = announcement.guildId;
  if (guildId) {
    const query = collRef.where('metadata.integrations.discord.guildId', '==', guildId);

    let snapshot = await query.where('hasBlueCheck', '==', true).limit(1).get();
    if (snapshot.size === 0) {
      snapshot = await query.limit(1).get();
    }

    const doc = snapshot.docs[0];

    if (doc) {
      const data = doc.data() as BaseCollection;
      if (data.address) {
        await batch.addAsync(
          ref,
          {
            collectionAddress: data.address,
            collectionName: data.metadata?.name,
            collectionSlug: data.slug,
            collectionProfileImage: data.metadata?.profileImage,
            chainId: data.chainId,
            hasBlueCheck: data.hasBlueCheck ?? false
          },
          { merge: true }
        );
      }
    }
  }
}

void main();
