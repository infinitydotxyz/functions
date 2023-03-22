import { ethers } from 'ethers';
import cron from 'node-cron';

import { getExchangeAddress } from '@infinityxyz/lib/utils';
import { Common } from '@reservoir0x/sdk';

import { config } from '@/config/index';
import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { AbstractBlockProcessor } from '@/lib/on-chain-events/block-processor/block-processor.abstract';
import { BlockScheduler } from '@/lib/on-chain-events/block-scheduler';
import { Erc20 } from '@/lib/on-chain-events/erc20/erc20';
import { Erc721 } from '@/lib/on-chain-events/erc721/erc721';
import { FlowExchange } from '@/lib/on-chain-events/flow-exchange/flow-exchange';
import { getProvider } from '@/lib/utils/ethersUtils';

import { redis } from '../redis';

export async function initializeIndexerEventSyncing() {
  const promises: Promise<unknown>[] = [];

  const db = getDb();

  /**
   * Initialize on chain event syncing
   *
   * note - requires us to restart the indexer when we
   * add support for/remove support for a collection
   */
  for (const chainId of config.supportedChains) {
    const exchangeAddress = getExchangeAddress(chainId);
    const wethAddress = Common.Addresses.Weth[parseInt(chainId, 10)];
    const provider = getProvider(chainId);
    const wsProvider = new ethers.providers.WebSocketProvider(
      provider.connection.url.replace('https', 'wss'),
      parseInt(chainId, 10)
    );
    const flowBlockProcessor = new FlowExchange(redis, chainId, exchangeAddress, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 5
    });

    const wethBlockProcessor = new Erc20(redis, chainId, wethAddress, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 5
    });

    const supportedCollections = new SupportedCollectionsProvider(db, chainId);
    await supportedCollections.init();
    const blockProcessors: AbstractBlockProcessor[] = [flowBlockProcessor, wethBlockProcessor];

    for (const item of supportedCollections.values()) {
      const [itemChainId, erc721Address] = item.split(':');

      if (itemChainId !== chainId) {
        throw new Error(`ChainId mismatch: ${itemChainId} !== ${chainId}`);
      }

      const erc721BlockProcessor = new Erc721(redis, chainId, erc721Address, {
        enableMetrics: false,
        concurrency: 1,
        debug: true,
        attempts: 5
      });

      blockProcessors.push(erc721BlockProcessor);
    }

    const blockScheduler = new BlockScheduler(redis, chainId, provider, wsProvider, blockProcessors, {
      enableMetrics: false,
      concurrency: 1,
      debug: true,
      attempts: 1
    });
    const trigger = async () => {
      await blockScheduler.add({
        id: chainId
      });
    };
    cron.schedule('*/2 * * * *', async () => {
      await trigger();
    });

    promises.push(trigger());

    const blockProcessorPromises = blockProcessors.map((blockProcessor) => blockProcessor.run());
    promises.push(blockScheduler.run(), ...blockProcessorPromises);
  }

  await Promise.all(promises);
}
