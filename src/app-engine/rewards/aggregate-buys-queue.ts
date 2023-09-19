import { Job } from 'bullmq';
import { FieldPath } from 'firebase-admin/firestore';
import Redis from 'ioredis';
import { ExecutionError } from 'redlock';

import { ONE_MIN } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { getMap } from '@/firestore/get-map';
import { streamQueryPageWithRef } from '@/firestore/stream-query';
import { CollRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions } from '@/lib/process/types';
import {
  BuyEvent,
  ChainStats,
  ChainUserStats,
  DailyChainStats,
  DailyChainUserStats,
  DailyTotalStats,
  DailyUserStats,
  SalesStats,
  TotalStats,
  UserStats,
  getDefaultChainStats,
  getDefaultChainUserStats,
  getDefaultTotalStats,
  getDefaultUserStats,
  getSaleRefs,
  toDaily
} from '@/lib/rewards-v2/referrals/sdk';

import { redlock } from '../redis';

export interface AggregateBuysJobData {
  id: string;
}

export interface AggregateBuysJobResult {
  id: string;
  status: 'completed' | 'errored' | 'skipped';
}

export class AggregateBuysQueue extends AbstractProcess<AggregateBuysJobData, AggregateBuysJobResult> {
  constructor(id: string, redis: Redis, options?: ProcessOptions) {
    super(redis, id, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<AggregateBuysJobData, AggregateBuysJobResult, string>): Promise<AggregateBuysJobResult> {
    const db = getDb();
    const lockDuration = 5_000;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped'
      };
    }

    const id = `stats:aggregate:buys:lock`;
    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          if (signal.aborted) {
            throw new Error('Abort');
          }
        };

        const saleEventsRef = db
          .collection('pixl')
          .doc('salesCollections')
          .collection('salesEvents') as CollRef<BuyEvent>;
        const query = saleEventsRef
          .where('processed', '==', false)
          .orderBy('timestamp', 'asc')
          .orderBy(FieldPath.documentId());

        const stream = streamQueryPageWithRef(query, (item, ref) => [item.timestamp, ref], { pageSize: 50 });
        for await (const page of stream) {
          if (page.length === 0) {
            return;
          }
          checkAbort();
          const refs = new Map<string, FirebaseFirestore.DocumentReference<SalesStats>>();
          for (const { data } of page) {
            const saleRefs = Object.values(
              getSaleRefs(db, {
                buyer: data.sale.buyer,
                chainId: data.chainId,
                timestamp: data.sale.saleTimestamp
              })
            );
            for (const saleRef of saleRefs) {
              refs.set(saleRef.path, saleRef);
            }
          }

          const { get, set, save: saveStats } = await getMap(db, refs);

          const batch = db.batch();
          for (const { data, ref } of page) {
            const saleRefs = getSaleRefs(db, {
              buyer: data.sale.buyer,
              chainId: data.chainId,
              timestamp: data.sale.saleTimestamp
            });

            const totalSales: TotalStats =
              get(saleRefs.totalSales.path) ?? set(saleRefs.totalSales.path, getDefaultTotalStats());
            const chainSales: ChainStats =
              get(saleRefs.chainSales.path) ?? set(saleRefs.chainSales.path, getDefaultChainStats(data.chainId));
            const userSales: UserStats =
              get(saleRefs.userSales.path) ?? set(saleRefs.userSales.path, getDefaultUserStats(data.sale.buyer));
            const chainUserSales: ChainUserStats =
              get(saleRefs.chainUserSales.path) ??
              set(
                saleRefs.chainUserSales.path,
                getDefaultChainUserStats({ user: data.sale.buyer, chainId: data.chainId })
              );

            const dailyChainSales: DailyChainStats =
              get(saleRefs.dailyChainSales.path) ??
              set(saleRefs.dailyChainSales.path, toDaily(data.sale.saleTimestamp, getDefaultChainStats(data.chainId)));

            const dailyUserSales: DailyUserStats =
              get(saleRefs.dailyUserSales.path) ??
              set(saleRefs.dailyUserSales.path, toDaily(data.sale.saleTimestamp, getDefaultUserStats(data.sale.buyer)));

            const dailyChainUserSales: DailyChainUserStats =
              get(saleRefs.dailyChainUserSales.path) ??
              set(
                saleRefs.dailyChainUserSales.path,
                toDaily(
                  data.sale.saleTimestamp,
                  getDefaultChainUserStats({ user: data.sale.buyer, chainId: data.chainId })
                )
              );
            const dailyTotalSales: DailyTotalStats =
              get(saleRefs.dailyTotalSales.path) ??
              set(saleRefs.dailyTotalSales.path, toDaily(data.sale.saleTimestamp, getDefaultTotalStats()));

            const stats = [
              totalSales,
              chainSales,
              userSales,
              chainUserSales,
              dailyChainSales,
              dailyUserSales,
              dailyChainUserSales,
              dailyTotalSales
            ];

            for (const stat of stats) {
              if (data.isNativeFill || data.isNativeBuy) {
                stat.numBuys += 1;
                stat.volume += data.sale.salePriceUsd;
              }
              if (data.isNativeBuy) {
                stat.numNativeBuys += 1;
                stat.nativeVolume += data.sale.salePriceUsd;
              }
            }
            // mark the sale as processed
            batch.set(ref, { processed: true }, { merge: true });
          }
          // update the stats
          saveStats(batch);
          await batch.commit();
        }
      });

      return {
        id: job.data.id,
        status: 'completed'
      };
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${id}`);
      } else {
        this.error(`${err}`);
      }

      return {
        id: job.data.id,
        status: 'errored'
      };
    }
  }
}
