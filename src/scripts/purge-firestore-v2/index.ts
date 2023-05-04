import 'module-alias/register';

import { redis } from '@/app-engine/redis';
import { logger } from '@/lib/logger';

import { FirestoreDeletionProcess } from './process';

async function main() {
  const queue = new FirestoreDeletionProcess(redis, {
    enableMetrics: false,
    concurrency: 16,
    debug: true,
    attempts: 3
  });
}
