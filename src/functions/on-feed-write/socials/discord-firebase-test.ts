/**
 * WARNING: this file only exists to test the webhook manually!
 *
 * Usage:
 *
 * $ npx ts-node ./src/functions/on-feed-write/socials/discord-firebase-test.ts
 */

import { EventType, FeedEvent } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getDb } from '../../../firestore';
import { notifyDiscordWebhook } from './discord';

// min and max included
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function main() {
  const db = getDb();

  const types = [EventType.NftSale, EventType.NftOffer, EventType.NftListing];

  for (const type of types) {
    const snap = await db
      .collection(firestoreConstants.FEED_COLL)
      .where('type', '==', type)
      .offset(rnd(0, 200))
      .limit(1)
      .get();
    const doc = snap.docs[0];
    await notifyDiscordWebhook(doc.data() as FeedEvent);
  }
}

void main();
