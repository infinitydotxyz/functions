import { BulkJobOptions, Job } from 'bullmq';
import { EventFilter, ethers } from 'ethers';
import { Redis } from 'ioredis';
import { ExecutionError } from 'redlock';

import { ChainId } from '@infinityxyz/lib/types/core';
import { sleep } from '@infinityxyz/lib/utils';

import { AbstractProcess } from '@/lib/process/process.abstract';
import { JobDataType, ProcessOptions } from '@/lib/process/types';

import { redlock } from '../../app-engine/redis';
import { AbstractEvent } from './event.abstract';
import {
  BaseParams,
  EthersJsonRpcRequest,
  HistoricalLogs,
  HistoricalLogsChunk,
  JsonRpcError,
  PaginateLogsOptions,
  ThunkedLogRequest
} from './types';

interface BlockProcessorJobData {
  id: string;
  latestBlockNumber: number;
  finalizedBlockNumber: number;
  chainId: ChainId;
  httpsProviderUrl: string;
}

interface BlockProcessorJobResult {
  id: string;
  blocksProcessed: number;
  logsProcessed: number;
}

interface Cursor {
  metadata: {
    chainId: ChainId;
    updatedAt: number;
  };
  data: {
    latestBlockNumber: number;
    finalizedBlockNumber: number;
  };
}

export abstract class AbstractBlockProcessor extends AbstractProcess<BlockProcessorJobData, BlockProcessorJobResult> {
  protected optimizeAfterXEmptyRequests = 5;
  protected type: string;
  constructor(
    _db: Redis,
    protected _chainId: ChainId,
    type: string,
    protected _startBlockNumber: number,
    protected _address: string,
    options?: ProcessOptions
  ) {
    super(_db, `block-processor:chain:${_chainId}:type:${type}`, options);
    this.type = type;
  }

  protected abstract events: AbstractEvent<unknown>[];

  protected get eventFilters(): EventFilter[] {
    return this.events.map((event) => event.eventFilter);
  }

  async add(job: BlockProcessorJobData, id?: string): Promise<void>;
  async add(jobs: BlockProcessorJobData[]): Promise<void>;
  async add(job: BlockProcessorJobData | BlockProcessorJobData[], id?: string): Promise<void> {
    const arr = Array.isArray(job) ? job : [job];
    if (Array.isArray(job) && id) {
      throw new Error(`Can only specify an id for a single job`);
    }

    const jobs: {
      name: string;
      data: JobDataType<BlockProcessorJobData>;
      opts?: BulkJobOptions | undefined;
    }[] = arr.map((item) => {
      return {
        name: `${item.id}`,
        data: {
          _processMetadata: {
            type: 'default'
          },
          ...item
        }
      };
    });
    await this._queue.addBulk(jobs);
  }

  protected async _loadCursor(): Promise<{ cursor: Cursor; isBackfill: boolean }> {
    const cursorKey = `${this.type}:cursor`;
    let cursor: Cursor;
    let isBackfill = false;
    try {
      cursor = JSON.parse((await this._db.get(cursorKey)) ?? '') as Cursor;
    } catch (err) {
      this.log(`Failed to find cursor, starting from block ${this._startBlockNumber}`);
      cursor = {
        metadata: {
          chainId: this._chainId,
          updatedAt: Date.now()
        },
        data: {
          latestBlockNumber: this._startBlockNumber - 1,
          finalizedBlockNumber: this._startBlockNumber - 1
        }
      };
      isBackfill = true;
    }
    return { cursor, isBackfill };
  }

  protected async saveCursor(cursor: Cursor): Promise<void> {
    const cursorKey = `${this.type}:cursor`;
    await this._db.set(cursorKey, JSON.stringify(cursor));
  }

  protected getEventParams = (log: ethers.providers.Log): BaseParams => {
    const address = log.address.toLowerCase();
    const block = log.blockNumber;
    const blockHash = log.blockHash.toLowerCase();
    const txHash = log.transactionHash.toLowerCase();
    const txIndex = log.transactionIndex;
    const logIndex = log.logIndex;

    return {
      chainId: this._chainId,
      address,
      txHash,
      txIndex,
      block,
      blockHash,
      logIndex,
      batchIndex: 1
    };
  };

  async processJob(job: Job<BlockProcessorJobData, BlockProcessorJobResult, string>): Promise<BlockProcessorJobResult> {
    const { httpsProviderUrl, chainId, latestBlockNumber, finalizedBlockNumber } = job.data;
    const httpProvider = new ethers.providers.StaticJsonRpcProvider(httpsProviderUrl, parseInt(chainId, 10));
    const lockKey = `block-processor:chain:${chainId}:type:${this.type}:lock`;
    const lockDuration = 5_000;

    try {
      const result = await redlock.using([lockKey], lockDuration, async (signal) => {
        const checkSignal = () => {
          if (signal.aborted) {
            throw new Error('Lock aborted');
          }
        };

        const { cursor, isBackfill } = await this._loadCursor();
        checkSignal();

        const fromLatestBlockNumber = cursor.data.latestBlockNumber + 1;
        const fromFinalizedBlockNumber = cursor.data.finalizedBlockNumber + 1;
        const toLatestBlockNumber = latestBlockNumber;
        const toFinalizedBlockNumber = finalizedBlockNumber;

        let blocksProcessed = 0;
        let logsProcessed = 0;

        if (fromFinalizedBlockNumber <= toFinalizedBlockNumber) {
          this.log(`Processing finalized blocks ${fromFinalizedBlockNumber} to ${toFinalizedBlockNumber}`);
          const finalizedLogs = await this.getLogs(fromFinalizedBlockNumber, toFinalizedBlockNumber, httpProvider);
          checkSignal();
          const { logsProcessed: numLogs, blocksProcessed: numBlocks } = await this.processLogs(
            finalizedLogs,
            finalizedBlockNumber,
            isBackfill,
            checkSignal
          );
          logsProcessed += numLogs;
          blocksProcessed += numBlocks;
        }

        const latestBlock = Math.max(fromLatestBlockNumber, toFinalizedBlockNumber + 1);
        if (latestBlock <= toLatestBlockNumber) {
          this.log(`Processing latest blocks ${latestBlock} to ${toLatestBlockNumber}`);
          const latestLogs = await this.getLogs(latestBlock, toLatestBlockNumber, httpProvider);
          checkSignal();
          const { logsProcessed: numLogs, blocksProcessed: numBlocks } = await this.processLogs(
            latestLogs,
            finalizedBlockNumber,
            isBackfill,
            checkSignal
          );
          logsProcessed += numLogs;
          blocksProcessed += numBlocks;
        }

        checkSignal();
        await this.saveCursor({
          metadata: {
            chainId,
            updatedAt: Date.now()
          },
          data: {
            latestBlockNumber: toLatestBlockNumber,
            finalizedBlockNumber: toFinalizedBlockNumber
          }
        });

        return {
          id: job.data.id,
          blocksProcessed,
          logsProcessed
        };
      });

      return result;
    } catch (err) {
      if (err instanceof ExecutionError) {
        this.warn(`Failed to acquire lock`);
        await sleep(3000);
      } else if (err instanceof Error) {
        this.error(`${err}`);
      } else {
        this.error(`Unknown error: ${err}`);
      }
      throw err;
    }
  }

  async processLogs(logs: HistoricalLogs, finalizedBlockNumber: number, isBackfill: boolean, checkSignal: () => void) {
    let logsProcessed = 0;
    let blocksProcessed = 0;
    for await (const chunk of logs) {
      this.log(`Processing chunk ${chunk.fromBlock} to ${chunk.toBlock}. With ${chunk.events.length} logs`);
      const { events, fromBlock, toBlock } = chunk;
      const logsByBlock: {
        events: {
          log: ethers.providers.Log;
          baseParams: BaseParams;
        }[];
        blockNumber: number;
        commitment: 'finalized' | 'latest';
        blockHash?: string;
      }[] = [];
      for (let block = fromBlock; block <= toBlock; block += 1) {
        const blockEvents = events
          .filter((log) => log.blockNumber === block)
          .map((log) => {
            return {
              log,
              baseParams: this.getEventParams(log)
            };
          });

        logsProcessed += events.length;
        blocksProcessed += 1;
        logsByBlock.push({
          blockNumber: block,
          events: blockEvents,
          commitment: block < finalizedBlockNumber ? 'finalized' : 'latest',
          blockHash: blockEvents[0]?.log?.blockHash
        });
      }

      for (const block of logsByBlock) {
        if (block.commitment === 'latest') {
          this.log(`Processing block ${block.blockNumber} - ${block.blockHash} - ${block.commitment}`);
        }
        if (block.events.length > 0) {
          console.log(`Processing block ${block.blockNumber} With ${block.events.length} logs`);
        }
        await this._processBlock(block.events, block.blockNumber, block.commitment, isBackfill, block.blockHash);
        checkSignal();
      }
    }

    return {
      logsProcessed,
      blocksProcessed
    };
  }

  /**
   * _processBlock is expected to
   * 1. Process logs
   * 2. Process reorgs for each block for cases below
   *    2a. Commitment is finalized and block hash is different
   *    2b. Commitment is finalized and block number is the same but there are no logs
   *
   * @param logs - array of logs (possibly empty)
   * @param blockNumber - block number of the logs
   * @param commitment - 'finalized' or 'latest'
   * @param blockHash - block hash of the logs (only available if there are logs)
   */
  protected abstract _processBlock(
    events: { log: ethers.providers.Log; baseParams: BaseParams }[],
    blockNumber: number,
    commitment: 'latest' | 'finalized',
    isBackfill: boolean,
    blockHash?: string
  ): Promise<void>;

  protected async getLogs(fromBlock: number, toBlock: number, provider: ethers.providers.StaticJsonRpcProvider) {
    const eventFilters = this.eventFilters;
    const logRequest = async (fromBlock: number, toBlock: number) => {
      this.log(`Requesting logs from block ${fromBlock} to ${toBlock}`);

      const responses: ethers.providers.Log[] = [];
      for (const eventFilter of eventFilters) {
        const res = await provider.getLogs({
          fromBlock,
          toBlock,
          address: this._address,
          topics: eventFilter.topics
        });
        responses.push(...res);
      }
      return responses;
    };
    return this.paginateLogs(logRequest, provider, { fromBlock, toBlock, returnType: 'generator' });
  }

  protected async paginateLogs(
    thunkedLogRequest: ThunkedLogRequest,
    provider: ethers.providers.Provider,
    options: PaginateLogsOptions
  ): Promise<HistoricalLogs> {
    // eslint-disable-next-line prefer-const
    let { fromBlock, toBlock = 'latest', maxAttempts = 5 } = options;

    toBlock = toBlock ?? 'latest';

    const getMaxBlock = async (provider: ethers.providers.Provider, toBlock: number | 'latest'): Promise<number> => {
      let maxBlock: number;
      if (typeof toBlock === 'string') {
        try {
          maxBlock = await provider.getBlockNumber();
        } catch (err) {
          throw new Error(`failed to get current block number ${err}`);
        }
      } else {
        maxBlock = toBlock;
      }
      return maxBlock;
    };

    const maxBlock = await getMaxBlock(provider, toBlock);
    return this.paginateLogsHelper(thunkedLogRequest, fromBlock, maxBlock, maxAttempts);
  }

  protected *paginateLogsHelper(
    thunkedLogRequest: ThunkedLogRequest,
    minBlock: number,
    maxBlock: number,
    maxAttempts: number
  ): Generator<Promise<HistoricalLogsChunk>, void, unknown> {
    const defaultPageSize = 500;
    const blockRange = {
      maxBlock,
      minBlock,
      from: minBlock,
      to: minBlock + defaultPageSize,
      pageSize: defaultPageSize,
      maxPageSize: defaultPageSize
    };

    const errorHandler = this.ethersErrorHandler<HistoricalLogsChunk>(maxAttempts, 1000, blockRange);

    let pagesWithoutResults = 0;
    while (blockRange.from < blockRange.maxBlock) {
      yield errorHandler(async () => {
        // we can get a max of 2k blocks at once
        blockRange.to = blockRange.from + blockRange.pageSize;

        if (blockRange.to > blockRange.maxBlock) {
          blockRange.to = maxBlock;
        }
        const size = maxBlock - minBlock;
        const progress = Math.floor(((blockRange.from - blockRange.minBlock) / size) * 100 * 100) / 100;

        if (pagesWithoutResults > this.optimizeAfterXEmptyRequests) {
          try {
            const events = await thunkedLogRequest(blockRange.from, blockRange.maxBlock);
            const fromBlock = blockRange.minBlock;
            const toBlock = blockRange.maxBlock;
            blockRange.to = blockRange.maxBlock;
            return {
              progress,
              fromBlock,
              toBlock,
              events
            };
          } catch (err) {
            this.error(`Failed to optimize logs query ${err}`);
            pagesWithoutResults = 0;
          }
        }

        const from = blockRange.from;
        const to = from === 0 && blockRange.pageSize <= defaultPageSize ? blockRange.maxBlock : blockRange.to;
        const events = await thunkedLogRequest(from, to);

        if (events.length === 0) {
          pagesWithoutResults += 1;
        } else {
          pagesWithoutResults = 0;
        }

        const fromBlock = blockRange.minBlock;
        const toBlock = blockRange.to;
        return {
          progress,
          fromBlock,
          toBlock,
          events
        };
      });

      blockRange.from = blockRange.to + 1;
    }
  }

  protected ethersErrorHandler<Response>(
    maxAttempts = 5,
    retryDelay = 1000,
    blockRange?: { pageSize: number; from: number }
  ): (request: EthersJsonRpcRequest<Response>) => Promise<Response> {
    return async (request: EthersJsonRpcRequest<Response>): Promise<Response> => {
      const attempt = async (attempts = 0): Promise<Response> => {
        attempts += 1;
        try {
          const res = await request();
          return res;
        } catch (err: any) {
          this.error(`Failed ethers request ${JSON.stringify(err)}`);
          if (attempts > maxAttempts) {
            throw err;
          }

          if ('code' in err) {
            switch (err.code as unknown as JsonRpcError | string) {
              case JsonRpcError.RateLimit:
                await sleep(retryDelay);
                return await attempt(attempts);

              case JsonRpcError.ParseError:
                return await attempt(attempts);

              case JsonRpcError.InvalidRequest:
                throw err;

              case JsonRpcError.MethodNotFound:
                throw err;

              case JsonRpcError.InvalidParams:
                throw err;

              case JsonRpcError.InternalError:
                return await attempt(attempts);

              case JsonRpcError.ServerError:
                await sleep(retryDelay);
                return await attempt(attempts);

              case 'ETIMEDOUT':
                await sleep(retryDelay);
                return await attempt(attempts);

              case 'SERVER_ERROR':
                if (
                  'body' in err &&
                  typeof err.body === 'string' &&
                  (err.body as string).includes('Consider reducing your block range')
                ) {
                  if (blockRange) {
                    blockRange.pageSize = Math.floor(blockRange.pageSize / 2);
                    this.log(`\n\n Reducing block range to: ${blockRange.pageSize} \n\n`);
                    return await attempt(attempts);
                  }
                } else if (
                  typeof err.body === 'string' &&
                  (err.body as string).includes('this block range should work')
                ) {
                  if (blockRange) {
                    const regex = /\[(\w*), (\w*)]/;
                    const matches = ((JSON.parse(err.body as string)?.error?.message ?? '') as string).match(regex);
                    const validMinBlockHex = matches?.[1];
                    const validMaxBlockHex = matches?.[2];

                    if (validMinBlockHex && validMaxBlockHex) {
                      const validMinBlock = parseInt(validMinBlockHex, 16);
                      const validMaxBlock = parseInt(validMaxBlockHex, 16);
                      const range = validMaxBlock - validMinBlock;
                      blockRange.from = validMinBlock;
                      blockRange.pageSize = range;
                      this.log(
                        `\n\n Reducing block range to recommended range: ${blockRange.from} - ${
                          blockRange.from + blockRange.pageSize
                        }. \n\n`
                      );
                    }
                  }
                }
                await sleep(retryDelay);
                return await attempt(attempts);

              case 'TIMEOUT':
                await sleep(retryDelay);
                return await attempt(attempts);

              default:
                this.log(`Encountered unknown error code ${err?.code}`);
                throw err;
            }
          }

          this.log('failed to get code from ethers error');
          this.log(err);

          return await attempt(attempts);
        }
      };

      const response = await attempt();
      return response;
    };
  }
}
