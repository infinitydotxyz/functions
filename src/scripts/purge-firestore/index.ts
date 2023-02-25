import 'module-alias/register';

import { ChainId, EventType } from '@infinityxyz/lib/types/core';
import { ONE_HOUR } from '@infinityxyz/lib/utils';

import { redis } from '@/app-engine/redis';
import { logger } from '@/lib/logger';

import { FeedJobData, FirestoreDeletionProcess } from './process';

async function main() {
  const queue = new FirestoreDeletionProcess(redis, {
    enableMetrics: false,
    concurrency: 16,
    debug: true,
    attempts: 3
  });

  logger.log('process', 'Adding items to queue');

  const feedEvents = [
    EventType.NftListing,
    EventType.NftOffer,
    EventType.NftSale,
    EventType.NftTransfer,
    EventType.TokensRageQuit,
    EventType.TokensStaked,
    EventType.TokensUnStaked,
    EventType.TwitterTweet,
    EventType.UserVote,
    EventType.UserVoteRemoved
  ];

  for (const feedEvent of feedEvents) {
    const job: FeedJobData = {
      id: feedEvent,
      type: 'feed',
      eventTypeToDelete: feedEvent,
      keepEventsAfterTimestamp: Date.now() - ONE_HOUR * 24
    };
    await queue.add(job);
  }

  await queue.add({
    id: 'marketplace-stats',
    type: 'marketplace-stats'
  });

  await queue.add({
    id: 'collections-trigger',
    type: 'collections-trigger',
    numQueries: 128,
    chainId: ChainId.Goerli
  });

  await queue.add({
    id: 'collections-trigger',
    type: 'collections-trigger',
    numQueries: 128,
    chainId: ChainId.Polygon
  });

  await queue.add({
    id: 'collections-trigger',
    type: 'collections-trigger',
    numQueries: 128,
    chainId: ChainId.Mainnet
  });

  await queue.add({
    id: 'nfts-trigger',
    type: 'nfts-trigger',
    numQueries: 128,
    chainId: ChainId.Mainnet
  });

  await queue.add({
    id: 'nfts-trigger',
    type: 'nfts-trigger',
    numQueries: 128,
    chainId: ChainId.Goerli
  });

  await queue.add({
    id: 'nfts-trigger',
    type: 'nfts-trigger',
    numQueries: 128,
    chainId: ChainId.Polygon
  });

  await queue.add({
    id: 'collection-stats-trigger',
    type: 'collection-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Mainnet
  });

  await queue.add({
    id: 'collection-stats-trigger',
    type: 'collection-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Goerli
  });

  await queue.add({
    id: 'collection-stats-trigger',
    type: 'collection-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Polygon
  });

  await queue.add({
    id: 'socials-stats-trigger',
    type: 'socials-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Mainnet
  });

  await queue.add({
    id: 'socials-stats-trigger',
    type: 'socials-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Goerli
  });

  await queue.add({
    id: 'socials-stats-trigger',
    type: 'socials-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Polygon
  });

  await queue.add({
    id: 'nft-stats-trigger',
    type: 'nft-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Mainnet
  });

  await queue.add({
    id: 'nft-stats-trigger',
    type: 'nft-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Goerli
  });

  await queue.add({
    id: 'nft-stats-trigger',
    type: 'nft-stats-trigger',
    numQueries: 32,
    chainId: ChainId.Polygon
  });

  logger.log('process', 'Done adding items to queue');

  logger.log('process', 'Starting workers');
  await queue.run();
  logger.log('process', 'Running workers');
}

void main();
