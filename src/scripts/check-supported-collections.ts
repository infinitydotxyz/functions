import { Collection, SupportedCollection } from '@infinityxyz/lib/types/core';

import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';

async function main() {
  const db = getDb();

  const supportedCollections = db.collection('supportedCollections') as CollRef<SupportedCollection>;
  const collections = db.collection('collections') as CollRef<Collection>;

  const countSnap = await supportedCollections.where('isSupported', '==', true).count().get();
  const count = countSnap.data().count;

  console.log(`${count} Supported Collections \n\n`);
  const stream = streamQueryWithRef(supportedCollections.where('isSupported', '==', true));

  const supported: { name: string; address: string }[] = [];
  const removed: { name: string; address: string }[] = [];
  for await (const { data, ref } of stream) {
    if (data.isSupported) {
      console.log(
        `Collection: ${data.name} \t ${data.chainId}:${data.address} \t Is Supported ${data.isSupported ? '✅' : '❌'}`
      );
      console.log(`OpenSea Link: https://opensea.io/assets/ethereum/${data.address}/1`);

      let answered = false;
      while (!answered) {
        console.log(`Would you like to keep this collection? (y/n)`);
        const answer = await new Promise<string>((resolve) => {
          process.stdin.once('data', (data) => {
            resolve(data.toString().trim().toLowerCase());
          });
        });
        switch (answer) {
          case 'y': {
            console.log(`Keeping collection ${data.chainId}:${data.address} ${data.name}`);
            answered = true;
            supported.push({ name: data.name, address: data.address });
            break;
          }

          case 'n': {
            console.log(`Removing collection ${data.chainId}:${data.address} ${data.name}`);
            await ref.set({ isSupported: false }, { merge: true });
            await collections.doc(`${data.chainId}:${data.address}`).set({ isSupported: false }, { merge: true });
            answered = true;
            removed.push({ name: data.name, address: data.address });
            break;
          }

          default: {
            console.log(`Invalid answer: ${answer}`);
          }
        }
      }

      console.log('\n\n');
    }
  }

  console.log(`Complete! Supported: ${supported.length}, Removed: ${removed.length}`);

  console.log(JSON.stringify(removed, null, 2));
}
void main().then(() => {
  process.exit(0);
});
