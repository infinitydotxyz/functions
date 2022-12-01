import PQueue from 'p-queue';

import {
  ChainId,
  PreMergedRewardEvent,
  PreMergedRewardListingEvent,
  PreMergedRewardSaleEvent,
  RewardEvent,
  RewardEventVariant,
  RewardListingEvent,
  RewardSaleEvent
} from '@infinityxyz/lib/types/core';

import { FirestoreBatchEventProcessor } from '@/firestore/firestore-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getCachedUserStakeLevel } from '@/lib/utils/get-cached-user-stake-level';
import { getTokenPairPrice } from '@/lib/utils/token-price';
import { USDC_MAINNET, WETH_MAINNET } from '@/lib/utils/token-price/constants';

import { getSaleReferral } from '../referrals/get-referrals';

export class RewardsEventMerger extends FirestoreBatchEventProcessor<PreMergedRewardEvent> {
  protected _isEventProcessed(event: PreMergedRewardEvent): boolean {
    return event.isMerged;
  }

  protected _getUnProcessedEvents(
    ref: CollRef<PreMergedRewardEvent> | CollGroupRef<PreMergedRewardEvent>
  ): Query<PreMergedRewardEvent> {
    return ref.where('isMerged', '==', false);
  }

  protected _applyUpdatedAtLessThanFilter(
    query: Query<PreMergedRewardEvent>,
    timestamp: number
  ): Query<PreMergedRewardEvent> {
    return query.where('updatedAt', '<', timestamp);
  }

  protected async _processEvents(
    events: QuerySnap<PreMergedRewardEvent>,
    txn: FirebaseFirestore.Transaction
  ): Promise<void> {
    const getUserStakeLevel = getCachedUserStakeLevel();

    const items = events.docs.map((item) => {
      return {
        event: item.data(),
        ref: item.ref
      };
    });

    const queue = new PQueue({ concurrency: 10 });

    const promises = await Promise.all(
      items.map(async (item) => {
        await queue.add(async () => {
          const data = item.event;
          const ref = item.ref as DocRef<PreMergedRewardEvent | RewardEvent>;

          switch (data.discriminator) {
            case RewardEventVariant.Sale: {
              const merged = await this.getMergedSaleEvent(data, this._getDb());
              txn.set(ref, { ...merged, updatedAt: Date.now() }, { merge: true });
              break;
            }
            case RewardEventVariant.Listing: {
              const merged = await this.getMergedListingEvent(data, getUserStakeLevel);
              txn.set(ref, { ...merged, updatedAt: Date.now() }, { merge: true });
              break;
            }
            default: {
              console.error(`Merging is not implemented for event type: ${(data as any)?.discriminator}`);
            }
          }
        });
      })
    );

    /**
     * these should resolve at the same time
     */
    await Promise.all(promises);
    await queue.onIdle();
  }

  protected async getMergedListingEvent(
    event: PreMergedRewardListingEvent,
    getUserStakeLevel: (
      userAddress: string,
      stakerContractAddress: string,
      stakerContractChainId: ChainId,
      blockNumber: number
    ) => Promise<number | null>
  ): Promise<RewardListingEvent> {
    const stakeLevel = await getUserStakeLevel(
      event.order.makerAddress,
      event.stakerContractAddress,
      event.stakerContractChainId,
      event.blockNumber
    );
    const merged: RewardListingEvent = {
      ...event,
      isMerged: true,
      stakeLevel: stakeLevel ?? 0
    };

    return merged;
  }

  protected async getMergedSaleEvent(
    saleEvent: PreMergedRewardSaleEvent,
    db: FirebaseFirestore.Firestore
  ): Promise<RewardSaleEvent> {
    const tokenPrice = await getTokenPairPrice(WETH_MAINNET, USDC_MAINNET, saleEvent.blockNumber);
    const asset = {
      collection: saleEvent.collectionAddress,
      tokenId: saleEvent.tokenId,
      chainId: saleEvent.chainId
    };

    const referral = await getSaleReferral(db, saleEvent.buyer, asset);

    const merged: RewardSaleEvent = {
      ...saleEvent,
      discriminator: RewardEventVariant.Sale,
      isMerged: true,
      referral: referral ?? undefined,
      ethPrice: tokenPrice.token1PerToken0
    };

    return merged;
  }
}
