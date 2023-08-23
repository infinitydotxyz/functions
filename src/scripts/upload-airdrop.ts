import { readFile } from 'fs/promises';

import { getDb } from '@/firestore/db';
import { CollRef } from '@/firestore/types';
import { AirdropEvent, AirdropTier, RewardsEvent } from '@/lib/rewards-v2/referrals/sdk';

async function main() {
  const airdropFile = 'airdrop.json';
  const data = await readFile(airdropFile, 'utf8');
  const parsed = JSON.parse(data) as { address: string; mints: number; volume: number; tier: AirdropTier }[];
  const db = getDb();

  let batch = db.batch();

  const eventsRef = db.collection('pixl').doc('pixlRewards').collection('pixlRewardEvents') as CollRef<RewardsEvent>;

  let count = 0;
  for (const { address, tier } of parsed) {
    const event: AirdropEvent = {
      kind: 'AIRDROP',
      user: address.toLowerCase(),
      tier,
      timestamp: Date.now(),
      processed: false
    };
    const doc = eventsRef.doc(`AIRDROP:${address.toLowerCase()}`);
    batch.create(doc, event);
    count += 1;

    if (count > 200) {
      count = 0;
      console.log('committing batch');
      await batch.commit();
      batch = db.batch();
    }
  }
  console.log('committing batch');
  await batch.commit();
}

void main();
