import { Job } from 'bullmq';
import { formatUnits } from 'ethers/lib/utils';
import Redis from 'ioredis';
import { ExecutionError } from 'redlock';

import { ChainId, OrderSource } from '@infinityxyz/lib/types/core';
import { ONE_HOUR, ONE_MIN, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';
import { DocRef } from '@/firestore/types';
import { AbstractProcess } from '@/lib/process/process.abstract';
import { ProcessOptions, WithTiming } from '@/lib/process/types';
import { FlattenedNFTSale } from '@/lib/reservoir/api/sales';
import { batchSaveToFirestore, syncPage } from '@/lib/reservoir/sales/sync-page';
import { ReservoirWebsocketClient } from '@/lib/reservoir/ws/client';
import { SaleResponse } from '@/lib/reservoir/ws/response';
import { getMarketplaceAddress } from '@/lib/utils/get-marketplace-address';

import { Reservoir } from '../../lib';
import { redlock } from '../redis';

export interface SalesJobData {
  id: string;
}

export type SalesJobResult = WithTiming<{
  id: string;
  status: 'skipped' | 'paused' | 'errored' | 'completed';
}>;

const transformRealtimeEvent = (chainId: string, item: SaleResponse): FlattenedNFTSale => {
  const amount = item.data.price?.amount ?? item.data.price?.netAmount;
  return {
    id: item.data.id,
    txhash: item.data.txHash,
    log_index: item.data.logIndex,
    bundle_index: item.data.batchIndex,
    block_number: item.data.block,
    wash_trading_score: item.data.washTradingScore,
    fill_source: item.data.fillSource,
    marketplace: item.data.orderSource,
    marketplace_address: getMarketplaceAddress(chainId as ChainId, item.data.orderSource as OrderSource),
    seller: item.data.from.toLowerCase(),
    buyer: item.data.to.toLowerCase(),
    quantity: item.data.amount,
    collection_address: item.data.token?.contract,
    collection_name: item.data.token?.collection?.name,
    token_id: item.data.token.tokenId,
    token_image: item.data.token.image,
    sale_timestamp: item.data.timestamp * 1000,
    sale_price: amount?.raw,
    sale_price_usd: amount?.usd ?? 0,
    sale_price_eth: parseFloat(formatUnits(amount?.raw ?? '0', item.data?.price?.currency?.decimals)),
    sale_currency_address: item.data.price.currency.contract,
    sale_currency_decimals: item.data.price.currency.decimals,
    sale_currency_symbol: item.data.price.currency.symbol
  };
};

export class SalesEventsQueue extends AbstractProcess<SalesJobData, SalesJobResult> {
  constructor(protected chainId: string, redis: Redis, options?: ProcessOptions) {
    super(redis, `reservoir-sale-sync:chain:${chainId}`, options);
  }

  public async run() {
    await super._run();
  }

  async processJob(job: Job<SalesJobData, SalesJobResult, string>): Promise<SalesJobResult> {
    const db = getDb();
    const chainId = this.chainId;
    const syncRef = db
      .collection('_sync')
      .doc('_reservoirSales')
      .collection('_reservoirSalesSyncMetadata')
      .doc(`${chainId}:sales`) as DocRef<Reservoir.Sales.Types.SyncMetadata>;
    const lockDuration = 5_000;
    const start = Date.now();
    const id = `reservoir-sales-sync:chain:${chainId}:lock`;
    const BATCH_SIZE = 100;

    if (job.timestamp < Date.now() - 10 * ONE_MIN) {
      return {
        id: job.data.id,
        status: 'skipped',
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    }

    try {
      await redlock.using([id], lockDuration, async (signal) => {
        this.log(`Acquired lock for ${id}`);
        const checkAbort = () => {
          const abort = signal.aborted;
          return { abort };
        };

        const checkAbortThrow = () => {
          const { abort } = checkAbort();
          if (abort) {
            throw new Error('Abort');
          }
        };

        const syncSnap = await syncRef.get();
        checkAbortThrow();
        let sync = syncSnap.data() ?? {
          metadata: {
            type: 'sales',
            chainId,
            updatedAt: Date.now()
          },
          data: {
            eventsProcessed: 0,
            lastItemProcessed: '',
            endTimestamp: Date.now() - ONE_HOUR
          }
        };

        const wsClient = new ReservoirWebsocketClient(chainId, config.reservoir.apiKey, { logger: this.logger });
        const disconnectPromise = new Promise<number>((resolve) => {
          wsClient.on('disconnect', ({ timestamp }) => {
            resolve(timestamp);
          });
        });

        const connectPromise = new Promise<number>((resolve) => {
          wsClient.on('connect', ({ timestamp }) => {
            resolve(timestamp);
          });
        });

        type BatchItem = FlattenedNFTSale;
        type Batch = {
          events: BatchItem[];
          sync: Reservoir.Sales.Types.SyncMetadata;
        };
        let hasBackfilled = false;
        const realtimeBatch: Batch = {
          events: [],
          sync
        };

        let timer: NodeJS.Timer | null = null;
        const saveRealtimeItem = async (startTimestamp: number, event: BatchItem) => {
          realtimeBatch.events.push(event);
          const updatedSync: Reservoir.Sales.Types.SyncMetadata = {
            metadata: {
              ...sync.metadata,
              updatedAt: Date.now()
            },
            data: {
              eventsProcessed: (sync.data.eventsProcessed += 1),
              lastItemProcessed: event.id,
              endTimestamp: startTimestamp
            }
          };
          realtimeBatch.sync = updatedSync;

          const save = async () => {
            try {
              checkAbortThrow();
            } catch (err) {
              wsClient.close({ shutdown: true });
              return;
            }

            if (realtimeBatch.events.length === 0) {
              return;
            }

            const batchCopy: Batch = {
              events: [...realtimeBatch.events],
              sync: {
                metadata: {
                  ...realtimeBatch.sync.metadata
                },
                data: {
                  ...realtimeBatch.sync.data
                }
              }
            };
            realtimeBatch.events = [];

            let successful = true;
            try {
              this.log('Saving realtime batch...');
              await batchSaveToFirestore(
                db,
                batchCopy.events.map((item) => ({ saleData: item, chainId }))
              );
              await syncRef.set(batchCopy.sync, { merge: true });
              sync = batchCopy.sync;
              this.log('Saved realtime batch!');
            } catch (err) {
              this.error(`Failed to save batch ${err}`);
              successful = false;
            }
            return {
              successful,
              batch: batchCopy
            };
          };
          if (hasBackfilled) {
            if (realtimeBatch.events.length > BATCH_SIZE) {
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
              await save();
            } else if (!timer) {
              timer = setTimeout(async () => {
                timer = null;
                await save();
              }, 15_000);
            }
          }
        };

        await wsClient.connect(
          {
            event: {
              type: 'subscribe',
              event: 'sale.created'
            },
            handler: (response) => {
              const sale = transformRealtimeEvent(chainId, response);
              if (sale) {
                saveRealtimeItem(response.published_at - ONE_MIN, sale).catch((err) => {
                  this.error(`Failed to save realtime event ${err}`);
                });
              }
            }
          },
          false
        );
        await connectPromise;
        this.log('Starting backfilling process...');
        const result = await syncPage(db, sync, checkAbort);
        checkAbortThrow();
        sync = {
          metadata: {
            ...sync.metadata,
            ...(result.sync.metadata ?? {})
          },
          data: {
            ...sync.data,
            ...(result.sync.data ?? {})
          }
        };
        await syncRef.set(sync, { merge: true });

        checkAbortThrow();
        this.log('Completed backfilling process!');
        hasBackfilled = true;
        await disconnectPromise;

        return;
      });

      return {
        id: job.data.id,
        status: 'completed',
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    } catch (err) {
      console.error(err);
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock for ${syncRef.id}`);
        await sleep(3000);
      } else if (err instanceof Error && err.message.includes('Paused')) {
        this.error(`${err}`);
        return {
          id: job.data.id,
          status: 'paused',
          timing: {
            created: job.timestamp,
            started: start,
            completed: Date.now()
          }
        };
      } else {
        this.error(`${err}`);
      }

      return {
        id: job.data.id,
        status: 'errored',
        timing: {
          created: job.timestamp,
          started: start,
          completed: Date.now()
        }
      };
    }
  }
}
