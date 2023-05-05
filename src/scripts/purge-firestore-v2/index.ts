import 'module-alias/register';

import { redis } from '@/app-engine/redis';
import { config } from '@/config/index';

import { FirestoreDeletionProcess } from './process';

async function main() {
  console.log(`IsDev ${config.isDev}`);
  const queue = new FirestoreDeletionProcess(redis, {
    enableMetrics: false,
    concurrency: 16,
    debug: true,
    attempts: 3
  });

  await queue.add({ id: 'search-collections', type: 'search-collections' });
  await queue.add({ id: 'purge-order-snapshots', type: 'purge-order-snapshots' });

  await queue.run();
}

void main();
