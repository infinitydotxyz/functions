import { isAddress } from 'ethers/lib/utils';
import { readFile, writeFile } from 'fs/promises';
import PQueue from 'p-queue';
import { resolve } from 'path';

import { ChainId } from '@infinityxyz/lib/types/core';
import { sleep } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { Firestore } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';

import { config } from '../config';
import { Reservoir } from '../lib';

async function main() {
  const db = getDb();
  const backfillFile = resolve(`sync/backfilled-collections-${config.isDev ? 'dev' : 'prod'}.json`);

  const backfilledCollections: string[] = await readFile(backfillFile, 'utf8').then((data) => JSON.parse(data));

  const supportedCollections = new SupportedCollectionsProvider(db);

  await supportedCollections.init();

  const colls = [...supportedCollections.values()];

  const backfilled = new Set<string>(backfilledCollections);
  const startTimestamp = 1672244138149;

  console.log(`Found ${colls.length} supported collections`);

  const queue = new PQueue({ concurrency: 3 });

  for (const coll of colls) {
    queue
      .add(async () => {
        if (!backfilled.has(coll)) {
          const [chainId, collection] = coll.split(':');
          if (chainId !== '1') {
            throw new Error('not mainnet');
          }
          if (!isAddress(collection)) {
            throw new Error(`invalid address ${collection}`);
          }
          console.log(`Starting collection ${coll}`);
          try {
            await Reservoir.OrderEvents.addSyncs(
              db,
              chainId as ChainId,
              ['collection-ask'],
              collection,
              startTimestamp
            );
            console.log(`Started collection ${coll}`);
            await sleep(60_000);
          } catch (err) {
            if (err instanceof Error && err.message.includes('Sync already exists')) {
              console.log(`Syncing already in progress for ${collection}`);
            } else {
              throw err;
            }
          }

          // eslint-disable-next-line no-constant-condition
          while (true) {
            try {
              const isComplete = await checkProgress(db, chainId as ChainId, collection);
              if (isComplete) {
                break;
              }
            } catch (err) {
              console.error(err);
            }
            await sleep(60_000);
          }

          console.log(`Pausing sync for ${coll}`);
          await Reservoir.OrderEvents.pauseSyncs(db, chainId as ChainId, ['collection-ask'], collection);
          console.log(`Paused sync for ${coll}`);

          console.log(`Saving backfilled collections`);
          backfilled.add(coll);
          await writeFile(backfillFile, JSON.stringify([...backfilled], null, 2));
          console.log(`Saved backfilled collections`);
        } else {
          console.log(`Collection ${coll} has already been backfilled`);
        }

        console.log(`Processed ${backfilled.size} of ${colls.length} collections`);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  await queue.onIdle();
  console.log(`All collections backfilled!`);
}

const checkProgress = async (db: Firestore, chainId: ChainId, collection: string) => {
  const syncs = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);
  const syncRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncRef(syncs, chainId, 'collection-ask', collection);

  const syncSnap = await syncRef.get();
  const syncData = syncSnap.data();
  const continuation = syncData?.data.continuation;

  if (!continuation) {
    throw new Error('no continuation');
  }
  const method = Reservoir.Api.Events.AskEvents.getEvents;
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const contract = collection ? { contract: collection } : {};
  const nextPage = await method(client, {
    ...contract,
    continuation,
    limit: 300,
    sortDirection: 'asc'
  });

  const nextId = nextPage.data.events[nextPage.data.events.length - 1].event.id;
  const nextTimestamp = nextPage.data.events[nextPage.data.events.length - 1].event.createdAt;

  const mostRecentPage = await method(client, {
    ...contract,
    limit: 1,
    sortDirection: 'desc'
  });

  const currentId = mostRecentPage.data.events[0].event.id;
  const currentTimestamp = mostRecentPage.data.events[0].event.createdAt;

  if (!nextTimestamp || !currentTimestamp) {
    console.log(`Failed to find timestamps - sync progress will be checked again in 1 minute`);
    return false;
  }

  const currentTimestampMs = new Date(currentTimestamp).getTime();
  const nextTimestampMs = new Date(nextTimestamp).getTime();
  const difference = Math.ceil(Math.abs(currentTimestampMs - nextTimestampMs) / 1000);
  if (difference < 60) {
    console.log(`Sync ${syncRef.id} complete`);
    return true;
  }

  const days = Math.floor(difference / (60 * 60 * 24));
  const hours = Math.floor((difference / (60 * 60)) % 24);
  const minutes = Math.floor((difference / 60) % 60);
  const seconds = Math.floor(difference % 60);

  console.log(
    `Sync ${syncRef.id} At ID: ${nextId} Reservoir at ID: ${currentId} Difference ${difference} seconds - ${days}d ${hours}h ${minutes}m ${seconds}s`
  );

  return false;
};

process.on('uncaughtException', (error, origin) => {
  console.error('Uncaught exception', error, origin);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
});

process.on('exit', (code) => {
  console.log(`Process exiting... Code: ${code}`);
});

void main();
