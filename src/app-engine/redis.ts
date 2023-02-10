import Redis from 'ioredis';
import Redlock from 'redlock';

import { config } from '../config';

export const redis = new Redis(config.redis.connectionUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const redlock = new Redlock([redis.duplicate()], { retryCount: 0 });
