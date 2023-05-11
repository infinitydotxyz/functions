import 'module-alias/register';

import { EventType } from '@infinityxyz/lib/types/core';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';

import { FirestoreDeletionProcess } from './process';

async function main() {
  console.log(`IsDev ${config.isDev}`);
  const queue = new FirestoreDeletionProcess(redis, {
    enableMetrics: false,
    concurrency: 16,
    debug: false,
    attempts: 3
  });

  await queue.add({ id: 'search-collections', type: 'search-collections' });
  await queue.add({ id: 'purge-order-snapshots', type: 'purge-order-snapshots' });
  await queue.add({ id: 'trigger-purge-contract-events', type: 'trigger-purge-contract-events' });
  await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftSale });
  await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftListing });
  await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftOffer });
  await queue.add({ id: 'purge-feed-events', type: 'purge-feed-events', eventType: EventType.NftTransfer });
  await queue.add({ id: 'trigger-purge-orders', type: 'trigger-purge-orders' });

  await queue.run();
}

void main();
