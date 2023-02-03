/* eslint-disable no-constant-condition */
import { sleep } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { Firestore } from '@/firestore/types';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { syncOrderEvents } from '@/lib/reservoir/order-events/sync-order-events';
import { syncSaleEvents } from '@/lib/reservoir/sales/sync-sale-events';

const db = getDb();
const supportedCollectionsProvider = new SupportedCollectionsProvider(db);

process.on('uncaughtException', (error, origin) => {
  console.error('Uncaught exception', error, origin);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection', reason);
});

process.on('exit', (code) => {
  console.log(`Process exiting... Code: ${code}`);
});

const processes = {
  syncSalesEvents: {
    enabled: true,
    start: () => {
      console.log('Starting sales sync');
      runSyncSalesEvents(db, supportedCollectionsProvider).catch((err) => {
        console.error(`Failed to run sync sales events`, err);
      });
    }
  },
  syncOrderEvents: {
    enabled: true,
    start: () => {
      console.log('Starting order sync');
      runSyncOrderEvents(db, supportedCollectionsProvider).catch((err) => {
        console.error(`Failed to run sync order events`, err);
      });
    }
  }
};

async function main() {
  await supportedCollectionsProvider.init();

  for (const process of Object.values(processes)) {
    if (process.enabled) {
      process.start();
    }
  }
}

void main();

async function runSyncOrderEvents(db: Firestore, supportedCollectionsProvider: SupportedCollectionsProvider) {
  while (true) {
    try {
      await syncOrderEvents(db, supportedCollectionsProvider, null, { pollInterval: 15_000, delay: 1000 });
    } catch (err) {
      console.error(`Failed to sync order events`, err);
      await sleep(60_000);
    }
  }
}

async function runSyncSalesEvents(db: Firestore, supportedCollectionsProvider: SupportedCollectionsProvider) {
  while (true) {
    try {
      await syncSaleEvents(db, supportedCollectionsProvider, null, { pollInterval: 15_000, delay: 1000 });
    } catch (err) {
      console.error(`Failed to sync sales events`, err);
      await sleep(60_000);
    }
  }
}
