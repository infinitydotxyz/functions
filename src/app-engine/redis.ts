import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import Redlock from 'redlock';

import { sleep } from '@infinityxyz/lib/utils';

import { logger } from '@/lib/logger';

import { config } from '../config';

export const redis = new Redis(config.redis.connectionUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const redlock = new Redlock([redis.duplicate()], { retryCount: 0 });

export const getLockKey = (name: string) => `lock:${name}`;

export const acquireLock = async (name: string, expirationInMs: number) => {
  const id = nanoid();
  const acquired = await redis.set(getLockKey(name), id, 'PX', expirationInMs, 'NX');

  return acquired === 'OK';
};

export const extendLock = async (name: string, expirationInMs: number) => {
  const id = nanoid();
  const extended = await redis.set(getLockKey(name), id, 'PX', expirationInMs, 'XX');
  return extended === 'OK';
};

export const releaseLock = async (name: string) => {
  await redis.del(getLockKey(name));
};

export const getLockExpiration = async (name: string) => {
  const ttl = await redis.ttl(getLockKey(name));

  if (ttl === -1) {
    return 'never' as const;
  } else if (ttl === -2) {
    return 'not-found' as const;
  }
  return ttl * 1000;
};

export class ExecutionError extends Error {
  constructor(public error: Error) {
    super(`Failed to execute call`);
  }
}

export const useLock = async <T>(
  name: string,
  lockDuration: number,
  fn: (signal: { abort: boolean }) => Promise<T>
) => {
  let signal = { abort: false };
  let interval: NodeJS.Timer | null = null;
  let lockAcquired = false;
  const intervalDuration = lockDuration / 2;

  if (intervalDuration < 2000) {
    throw new Error(`Lock duration should be at least 4 seconds`);
  }

  let attempts = 0;
  const maxAttempts = 3;

  const cleanup = async () => {
    if (lockAcquired) {
      await releaseLock(name).catch((err) => {
        logger.warn('redis-lock', `Failed to release lock ${name} ${err}`);
      });
    }
    if (interval) {
      clearInterval(interval);
    }
    signal.abort = true;
  };

  while (!lockAcquired) {
    attempts += 1;
    try {
      lockAcquired = await acquireLock(name, lockDuration);
      if (!lockAcquired) {
        throw new Error('Failed to acquire lock');
      }
      interval = setInterval(async () => {
        try {
          const extended = await extendLock(name, lockDuration);
          if (!extended) {
            throw new Error('Failed to extend lock');
          }
        } catch (err) {
          if (interval) {
            clearInterval(interval);
          }
          signal = { abort: true };
        }
      }, intervalDuration);

      try {
        const result = await fn(signal);
        await cleanup();
        return result;
      } catch (err) {
        throw new ExecutionError(err as Error);
      }
    } catch (err) {
      await cleanup();

      if (err instanceof ExecutionError) {
        throw err.error;
      } else if (!lockAcquired && attempts < maxAttempts) {
        await sleep(lockDuration / 3);
        continue;
      }
      throw Error('Failed to acquire lock');
    }
  }

  throw new Error('Failed to acquire lock');
};
