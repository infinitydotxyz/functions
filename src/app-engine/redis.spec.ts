/* eslint-disable @typescript-eslint/require-await */
import { nanoid } from 'nanoid';

import { sleep } from '@infinityxyz/lib/utils';

import { acquireLock, getLockExpiration, releaseLock, useLock } from './redis';

describe('useLock', () => {
  const lockName = nanoid();

  jest.setTimeout(20_000);

  beforeEach(async () => {
    await releaseLock(lockName);
  });

  it('should acquire the lock', async () => {
    const wasAcquired = await acquireLock(lockName, 5000);
    expect(wasAcquired).toBe(true);

    const expiration = await getLockExpiration(lockName);

    if (typeof expiration !== 'number') {
      throw new Error(`expiration should be a number`);
    }
    expect(expiration).toBeGreaterThan(0);
    await sleep(expiration);

    const newExpiration = await getLockExpiration(lockName);
    expect(newExpiration).toBe('not-found');
  });

  it('should release the lock', async () => {
    const wasAcquired = await acquireLock(lockName, 5000);
    expect(wasAcquired).toBe(true);

    const expiration = await getLockExpiration(lockName);

    if (typeof expiration !== 'number') {
      throw new Error(`expiration should be a number`);
    }
    expect(expiration).toBeGreaterThan(0);

    await releaseLock(lockName);

    const newExpiration = await getLockExpiration(lockName);
    expect(newExpiration).toBe('not-found');
  });

  it('useLock should acquire and release the lock', async () => {
    const result = await useLock(lockName, 5000, async (signal) => {
      const expiration = await getLockExpiration(lockName);
      if (typeof expiration !== 'number') {
        throw new Error(`expiration should be a number`);
      }
      expect(expiration).toBeGreaterThan(0);
      return 1;
    });

    expect(result).toBe(1);

    const expiration = await getLockExpiration(lockName);
    expect(expiration).toBe('not-found');
  });

  it('useLock should throw and release the lock if the function throws', async () => {
    const error = new Error('Original error');
    try {
      await useLock(lockName, 5000, async () => {
        throw error;
      });

      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBe(error);
      const expiration = await getLockExpiration(lockName);
      expect(expiration).toBe('not-found');
    }
  });

  it('useLock should auto extend the lock', async () => {
    try {
      await useLock(lockName, 5000, async () => {
        const firstExpiration = await getLockExpiration(lockName);
        if (typeof firstExpiration !== 'number') {
          expect(true).toBe(false);
          throw new Error(`firstExpiration should be a number`);
        }

        await sleep(firstExpiration + 2000);
        const secondExpiration = await getLockExpiration(lockName);

        if (typeof secondExpiration !== 'number') {
          expect(true).toBe(false);
          throw new Error(`secondExpiration should be a number`);
        }
        expect(secondExpiration).toBeGreaterThan(0);
      });

      const start = Date.now();

      while (Date.now() - start < 10_000) {
        const expiration = await getLockExpiration(lockName);
        expect(expiration).toBe('not-found');
        await sleep(1000);
      }

      const expiration = await getLockExpiration(lockName);
      expect(expiration).toBe('not-found');
    } catch (err) {
      expect(true).toBe(false);
    }
  });
});
