/* eslint-disable no-constant-condition */
import { Job } from 'bullmq';
import { EventFilter, ethers } from 'ethers';
import { Redis } from 'ioredis';
import 'module-alias/register';
import { ExecutionError } from 'redlock';

import { Log } from '@ethersproject/abstract-provider';
import { ChainId } from '@infinityxyz/lib/types/core';
import { sleep } from '@infinityxyz/lib/utils';

import { redis, redlock } from '@/app-engine/redis';
import { getDb } from '@/firestore/db';
import { logger } from '@/lib/logger';
import { WithTiming } from '@/lib/process/types';

import { AbstractEvent } from '../event.abstract';
import { getBlockTimestamp } from '../get-block-timestamp';
import {
  BaseParams,
  EthersJsonRpcRequest,
  HistoricalLogs,
  HistoricalLogsChunk,
  JsonRpcError,
  PaginateLogsOptions,
  ThunkedLogRequest
} from '../types';
import { BlockProcessorJobData, BlockProcessorJobResult } from './block-processor.abstract';
import { blockProcessorConfig } from './config';

const OptimizeAfterXEmptyRequests = 5;

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

async function loadCursor(
  chainId: ChainId,
  type: string,
  startBlockNumber: number,
  db: Redis
): Promise<{ cursor: Cursor; isBackfill: boolean }> {
  const cursorKey = `${type}:cursor`;
  let cursor: Cursor;
  let isBackfill = false;
  try {
    cursor = JSON.parse((await db.get(cursorKey)) ?? '') as Cursor;
  } catch (err) {
    logger.log('block-processor', `Failed to find cursor, starting from block ${startBlockNumber}`);
    cursor = {
      metadata: {
        chainId: chainId,
        updatedAt: Date.now()
      },
      data: {
        latestBlockNumber: startBlockNumber - 1,
        finalizedBlockNumber: startBlockNumber - 1
      }
    };
    isBackfill = true;
  }
  return { cursor, isBackfill };
}

async function saveCursor(type: string, cursor: Cursor, db: Redis): Promise<void> {
  const cursorKey = `${type}:cursor`;
  await db.set(cursorKey, JSON.stringify(cursor));
}

function getEventParams(chainId: ChainId, log: ethers.providers.Log, blockTimestamp: number): BaseParams {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;

  return {
    chainId,
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    batchIndex: 1,
    blockTimestamp
  };
}

export default async function (
  job: Job<BlockProcessorJobData, BlockProcessorJobResult, string>
): Promise<WithTiming<BlockProcessorJobResult>> {
  const start = Date.now();
  const {
    httpsProviderUrl,
    chainId,
    latestBlockNumber,
    finalizedBlockNumber,
    address,
    type: blockProcessorType
  } = job.data;

  const config = blockProcessorConfig[blockProcessorType];
  if (!config) {
    logger.warn('block-processor', `Unknown block processor type: ${blockProcessorType}`);
    return {
      id: job.data.id,
      blocksProcessed: 0,
      logsProcessed: 0,
      timing: {
        created: job.timestamp,
        started: start,
        completed: Date.now()
      }
    };
  }

  const id = config.id(chainId, address);
  const httpProvider = new ethers.providers.StaticJsonRpcProvider(httpsProviderUrl, parseInt(chainId, 10));
  const lockKey = `${id}:lock`;
  const lockDuration = 5000;

  const attempt = 0;
  while (true) {
    try {
      const db = getDb();
      const abi = config.abi;
      const contract = new ethers.Contract(address, abi, httpProvider);

      const eventHandlers = config.events.map((item) => new item(chainId, contract, address, db));
      const eventFilters = eventHandlers.map((item) => item.eventFilter);
      const startBlockNumber = config.startBlockNumberByChain[chainId];
      const result = await redlock.using([lockKey], lockDuration, async (signal) => {
        const checkSignal = () => {
          if (signal.aborted) {
            throw new Error('Lock aborted');
          }
        };

        const { cursor, isBackfill } = await loadCursor(chainId, id, startBlockNumber, redis);
        checkSignal();

        const fromLatestBlockNumber = cursor.data.latestBlockNumber + 1;
        const fromFinalizedBlockNumber = cursor.data.finalizedBlockNumber + 1;
        const toLatestBlockNumber = latestBlockNumber;
        const toFinalizedBlockNumber = finalizedBlockNumber;

        let blocksProcessed = 0;
        let logsProcessed = 0;

        if (fromFinalizedBlockNumber <= toFinalizedBlockNumber) {
          logger.log(id, `Processing finalized blocks ${fromFinalizedBlockNumber} to ${toFinalizedBlockNumber}`);
          const finalizedLogs = await getLogs(
            eventFilters,
            fromFinalizedBlockNumber,
            toFinalizedBlockNumber,
            httpProvider
          );
          checkSignal();
          const { logsProcessed: numLogs, blocksProcessed: numBlocks } = await processLogs(
            chainId,
            eventHandlers,
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
          logger.log(id, `Processing latest blocks ${latestBlock} to ${toLatestBlockNumber}`);
          const latestLogs = await getLogs(eventFilters, latestBlock, toLatestBlockNumber, httpProvider);
          checkSignal();
          const { logsProcessed: numLogs, blocksProcessed: numBlocks } = await processLogs(
            chainId,
            eventHandlers,
            latestLogs,
            finalizedBlockNumber,
            isBackfill,
            checkSignal
          );
          logsProcessed += numLogs;
          blocksProcessed += numBlocks;
        }

        checkSignal();
        await saveCursor(
          id,
          {
            metadata: {
              chainId,
              updatedAt: Date.now()
            },
            data: {
              latestBlockNumber: toLatestBlockNumber,
              finalizedBlockNumber: toFinalizedBlockNumber
            }
          },
          redis
        );

        return {
          id: job.data.id,
          blocksProcessed,
          logsProcessed,
          timing: {
            created: job.timestamp,
            started: start,
            completed: Date.now()
          }
        };
      });

      return result;
    } catch (err) {
      if (err instanceof ExecutionError) {
        logger.warn(id, `Failed to acquire lock`);
        await sleep(5000);
        if (attempt > 3) {
          throw err;
        }
      } else if (err instanceof Error) {
        logger.error(id, `${err}`);
        throw err;
      } else {
        logger.error(id, `Unknown error: ${err}`);
        throw err;
      }
    }
  }
}

async function processBlock(
  events: AbstractEvent<unknown>[],
  eventLogs: { log: Log; baseParams: BaseParams }[],
  blockNumber: number,
  commitment: 'finalized' | 'latest',
  isBackfill: boolean,
  blockHash?: string | undefined
): Promise<void> {
  const promises = [];
  for (const event of events) {
    promises.push(event.handleBlock(eventLogs, blockNumber, commitment, isBackfill, blockHash));
  }
  await Promise.all(promises);
}

async function processLogs(
  chainId: ChainId,
  eventHandlers: AbstractEvent<unknown>[],
  logs: HistoricalLogs,
  finalizedBlockNumber: number,
  isBackfill: boolean,
  checkSignal: () => void
) {
  let logsProcessed = 0;
  let blocksProcessed = 0;
  for await (const chunk of logs) {
    logger.log(
      'block-processor',
      `Processing chunk ${chunk.fromBlock} to ${chunk.toBlock}. With ${chunk.events.length} logs`
    );
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
      if (isBackfill && chunk.events.length === 0) {
        continue;
      }
      let blockTimestamp: number;
      const blockLogs = events.filter((log) => log.blockNumber === block);
      if (blockLogs.length > 0) {
        blockTimestamp = await getBlockTimestamp(chainId, block);
      } else {
        blockTimestamp = 0;
      }

      const blockEvents = blockLogs.map((log) => {
        return {
          log,
          baseParams: getEventParams(chainId, log, blockTimestamp)
        };
      });

      logsProcessed += blockEvents.length;
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
        logger.log(
          'block-processor',
          `Processing block ${block.blockNumber} - ${block.blockHash} - ${block.commitment}`
        );
      }
      await processBlock(eventHandlers, block.events, block.blockNumber, block.commitment, isBackfill, block.blockHash);
      checkSignal();
    }
  }

  return {
    logsProcessed,
    blocksProcessed
  };
}

async function getLogs(
  eventFilters: EventFilter[],
  fromBlock: number,
  toBlock: number,
  provider: ethers.providers.StaticJsonRpcProvider
) {
  const logRequest = async (fromBlock: number, toBlock: number) => {
    logger.log('block-processor', `Requesting logs from block ${fromBlock} to ${toBlock}`);

    const responses: ethers.providers.Log[] = [];
    for (const eventFilter of eventFilters) {
      const res = await provider.getLogs({
        fromBlock,
        toBlock,
        address: eventFilter.address,
        topics: eventFilter.topics
      });
      responses.push(...res);
    }
    return responses;
  };
  return paginateLogs(logRequest, provider, { fromBlock, toBlock, returnType: 'generator' });
}

async function paginateLogs(
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
  return paginateLogsHelper(thunkedLogRequest, fromBlock, maxBlock, maxAttempts);
}

function* paginateLogsHelper(
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

  const errorHandler = ethersErrorHandler<HistoricalLogsChunk>(maxAttempts, 1000, blockRange);

  let pagesWithoutResults = 0;
  while (blockRange.from <= blockRange.maxBlock) {
    yield errorHandler(async () => {
      // we can get a max of 2k blocks at once
      blockRange.to = blockRange.from + blockRange.pageSize;

      if (blockRange.to > blockRange.maxBlock) {
        blockRange.to = maxBlock;
      }
      const size = maxBlock - minBlock;
      const progress = Math.floor(((blockRange.from - blockRange.minBlock) / size) * 100 * 100) / 100;

      if (pagesWithoutResults > OptimizeAfterXEmptyRequests) {
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
          logger.error('block-processor', `Failed to optimize logs query ${err}`);
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

function ethersErrorHandler<Response>(
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
        logger.error('block-processor', `Failed ethers request ${JSON.stringify(err)}`);
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
                  logger.log('block-processor', `\n\n Reducing block range to: ${blockRange.pageSize} \n\n`);
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
                    logger.log(
                      'block-processor',
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
              logger.log('block-processor', `Encountered unknown error code ${err?.code}`);
              throw err;
          }
        }

        logger.log('block-processor', 'failed to get code from ethers error');
        logger.log('block-processor', err);

        return await attempt(attempts);
      }
    };

    const response = await attempt();
    return response;
  };
}
