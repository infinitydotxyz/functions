import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

import {
  ListingRewardsDoc,
  RewardListingEvent,
  RewardSaleEvent,
  TransactionFeeRewardDoc,
  UserRewardsEventDoc
} from '@infinityxyz/lib/types/core';
import { TradingFeeProgram, TradingFeeRefundDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, round } from '@infinityxyz/lib/utils';

import { CollRef } from '../../firestore/types';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { RewardListingEventSplit, TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeProgramEventHandler } from './trading-fee-program-event-handler.abstract';

export class TransactionFeeHandler extends TradingFeeProgramEventHandler {
  constructor() {
    super(TradingFeeProgram.TokenRefund);
  }

  protected _getListingReward(listing: RewardListingEvent | RewardListingEventSplit, config: TradingFeeRefundDto) {
    const listingConfig = config.listingRewardsConfig;
    if (!listingConfig) {
      return {
        reward: 0
      };
    }

    const durationValid = listing.order.endTimeMs - listing.order.startTimeMs > listingConfig.minTimeValid;
    if (!durationValid) {
      return {
        reward: 0
      };
    }

    if ('amountRemainingFromSplit' in listing) {
      return {
        reward: listing.amountRemainingFromSplit
      };
    }

    /**
     * filter out any listings that don't meet the duration or price requirements
     */
    const validListings = listing.order.items.filter((item) => {
      if (item.floorPriceEth === null) {
        return false;
      }
      const maxListingPrice = item.floorPriceEth * (listingConfig.maxPercentAboveFloor / 100) + item.floorPriceEth;
      const startPriceValid = listing.order.startPriceEth / item.numTokens <= maxListingPrice;
      const endPriceValid = listing.order.endPriceEth / item.numTokens <= maxListingPrice;
      return startPriceValid && endPriceValid;
    });

    /**
     * calculate the rewards for each item in the order
     */
    const stakeLevelMultiplier = listing.stakeLevel + 1;
    const rewardsByItem = validListings.map((item) => {
      const itemReward = item.rewardMultiplier * stakeLevelMultiplier * listingConfig.ticketMultiplier;
      return itemReward;
    });

    /**
     * prefer the most rewarding items in the order
     *
     * only allow the user to get rewards for the number of
     * items that will be included in a txn
     */
    const maxItemsInReward = Math.min(validListings.length, listing.order.numItems);
    const decreasingRewards = rewardsByItem.sort((a, b) => b - a);
    const reward = decreasingRewards.slice(0, maxItemsInReward).reduce((acc, item) => acc + item, 0);

    return {
      reward
    };
  }

  protected _getSaleReward(
    sale: RewardSaleEvent,
    tradingReward: TradingFeeRefundDto
  ): {
    total: number;
    buyer: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number };
    seller: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number };
  } {
    const buyerProtocolFee = sale.protocolFee * tradingReward.buyerPortion;
    const sellerProtocolFee = sale.protocolFee * tradingReward.sellerPortion;

    const buyerProtocolFeeWei = BigNumber.from(sale.protocolFeeWei)
      .mul(tradingReward.buyerPortion * 100_000)
      .div(100_000)
      .toString();
    const sellerProtocolFeeWei = BigNumber.from(sale.protocolFeeWei)
      .mul(tradingReward.sellerPortion * 100_000)
      .div(100_000)
      .toString();

    const protocolFeeUSDC = sale.protocolFee * sale.ethPrice;
    const reward = (protocolFeeUSDC * tradingReward.rewardRateNumerator) / tradingReward.rewardRateDenominator;
    const buyerReward = reward * tradingReward.buyerPortion;
    const sellerReward = reward * tradingReward.sellerPortion;
    return {
      total: reward,
      buyer: {
        reward: buyerReward,
        protocolFeesWei: buyerProtocolFeeWei,
        protocolFeesEth: buyerProtocolFee,
        protocolFeesUSDC: buyerProtocolFee * sale.ethPrice
      },
      seller: {
        reward: sellerReward,
        protocolFeesWei: sellerProtocolFeeWei,
        protocolFeesEth: sellerProtocolFee,
        protocolFeesUSDC: sellerProtocolFee * sale.ethPrice
      }
    };
  }

  protected _onListing(
    listing: RewardListingEvent | RewardListingEventSplit,
    phase: Phase
  ): TradingFeeEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    }
    const config = phase.details.tradingFeeRefund;
    if (!config) {
      return this._nonApplicableResponse(phase);
    } else if (phase.authority !== ProgressAuthority.TradingFees) {
      /**
       * phase rewards can exceed the phase supply
       */
      throw new Error(
        'Found applicable phase but authority is not trading fees. This may have unintended consequences.'
      );
    } else if (!config.listingRewardsConfig) {
      return this._nonApplicableResponse(phase);
    }

    const totalListingRewardsSupply = config.rewardSupply * (config.listingRewardsConfig.maxRewardSupplyPercent / 100);
    const listingRewardsRemaining = totalListingRewardsSupply - config.listingRewardsConfig.rewardSupplyUsed;
    const rewardSupplyRemaining = config.rewardSupply - config.rewardSupplyUsed;

    let { reward } = this._getListingReward(listing, config);

    const supplyRemaining = Math.min(listingRewardsRemaining, rewardSupplyRemaining);
    const shouldRollOverToNextPhase = rewardSupplyRemaining < listingRewardsRemaining;

    if (reward <= supplyRemaining || !shouldRollOverToNextPhase) {
      reward = Math.min(reward, listingRewardsRemaining);
      config.rewardSupplyUsed += reward;
      config.listingRewardsConfig.rewardSupplyUsed += reward;

      // update phase progress - should only be done by phase authority
      phase.details.progress = round(config.rewardSupplyUsed / config.rewardSupply, 6) * 100;
      const listingEvent = this._getListingEvent(listing, phase, reward, config);
      return {
        applicable: true,
        phase,
        saveEvent: (txn, db) => {
          const makerRef = db.collection(firestoreConstants.USERS_COLL).doc(listing.order.makerAddress);

          const makerTransactionFeeRewards = makerRef
            .collection(firestoreConstants.USER_REWARDS_COLL)
            .doc(listing.chainId)
            .collection(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL) as CollRef<UserRewardsEventDoc>;

          txn.create(makerTransactionFeeRewards.doc(), listingEvent);
        },
        split: undefined
      };
    }

    /**
     * we split the listing if the reward causes the current phase to end
     */
    const split = this._splitListing(listing, reward, supplyRemaining);

    return {
      applicable: true,
      phase,
      saveEvent: () => {
        return;
      },
      split
    };
  }

  protected _onSale(sale: RewardSaleEvent, phase: Phase): TradingFeeEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    }

    const config = phase.details.tradingFeeRefund;
    if (!config) {
      return this._nonApplicableResponse(phase);
    } else if (phase.authority !== ProgressAuthority.TradingFees) {
      /**
       * phase rewards can exceed the phase supply
       */
      throw new Error(
        'Found applicable phase but authority is not trading fees. This may have unintended consequences.'
      );
    }

    const { total: reward, buyer: buyerReward, seller: sellerReward } = this._getSaleReward(sale, config);

    const phaseSupplyRemaining = config.rewardSupply - config.rewardSupplyUsed;

    if (reward <= phaseSupplyRemaining) {
      const { buyer, seller } = this._getBuyerAndSellerEvents(sale, phase, buyerReward, sellerReward, config);
      config.rewardSupplyUsed += reward;

      // update phase progress - should only be done by phase authority
      phase.details.progress = round(config.rewardSupplyUsed / config.rewardSupply, 6) * 100;
      return {
        applicable: true,
        phase,
        saveEvent: (txn, db) => {
          const buyerRef = db.collection(firestoreConstants.USERS_COLL).doc(buyer.userAddress);
          const sellerRef = db.collection(firestoreConstants.USERS_COLL).doc(seller.userAddress);
          const buyerTransactionFeeRewards = buyerRef
            .collection(firestoreConstants.USER_REWARDS_COLL)
            .doc(sale.chainId)
            .collection(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL) as CollRef<UserRewardsEventDoc>;
          const sellerTransactionFeeRewards = sellerRef
            .collection(firestoreConstants.USER_REWARDS_COLL)
            .doc(sale.chainId)
            .collection(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL) as CollRef<UserRewardsEventDoc>;
          txn.create(buyerTransactionFeeRewards.doc(), buyer);
          txn.create(sellerTransactionFeeRewards.doc(), seller);
        },
        split: undefined
      };
    }

    const split = this._splitSale(sale, reward, phaseSupplyRemaining);

    return {
      applicable: true,
      phase,
      saveEvent: () => {
        return;
      },
      split
    };
  }

  protected _splitListing(
    listing: RewardListingEvent,
    reward: number,
    rewardRemaining: number
  ): {
    current: RewardListingEventSplit;
    remainder: RewardListingEventSplit;
  } {
    const split: {
      current: RewardListingEventSplit;
      remainder: RewardListingEventSplit;
    } = {
      current: {
        ...listing,
        amountRemainingFromSplit: rewardRemaining
      },
      remainder: {
        ...listing,
        amountRemainingFromSplit: reward - rewardRemaining
      }
    };
    return split;
  }

  protected _splitSale(
    sale: RewardSaleEvent,
    reward: number,
    phaseSupplyRemaining: number
  ): {
    current: RewardSaleEvent;
    remainder: RewardSaleEvent;
  } {
    const split = phaseSupplyRemaining / reward;
    const currentProtocolFee = sale.protocolFee * split;
    const currentProtocolFeeWei = parseEther(Math.floor(currentProtocolFee).toString()).toString();
    const remainingProtocolFee = sale.protocolFee - currentProtocolFee;
    const remainingProtocolFeeWei = parseEther(Math.floor(remainingProtocolFee).toString()).toString();

    return {
      current: {
        ...sale,
        price: sale.price * split,
        protocolFee: currentProtocolFee,
        protocolFeeWei: currentProtocolFeeWei,
        isSplit: true
      },
      remainder: {
        ...sale,
        price: sale.price * (1 - split),
        protocolFee: remainingProtocolFee,
        protocolFeeWei: remainingProtocolFeeWei,
        isSplit: true
      }
    };
  }

  protected _getListingEvent(
    listing: RewardListingEvent,
    phase: Phase,
    listingRewards: number,
    config: TradingFeeRefundDto
  ): ListingRewardsDoc {
    const doc: ListingRewardsDoc = {
      userAddress: listing.order.makerAddress,
      listing,
      chainId: listing.chainId,
      isSplit: listing.isSplit ?? false,
      isAggregated: false,
      /**
       * buyer and seller both receive the full volume of the sale
       */
      updatedAt: Date.now(),
      config,
      phaseId: phase.details.id,
      phaseName: phase.details.name,
      phaseIndex: phase.details.index,
      listingReward: listingRewards
    };

    return doc;
  }

  protected _getBuyerAndSellerEvents(
    sale: RewardSaleEvent,
    phase: Phase,
    buyerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number },
    sellerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number },
    config: TradingFeeRefundDto
  ): { buyer: TransactionFeeRewardDoc; seller: TransactionFeeRewardDoc } {
    const base: Omit<
      TransactionFeeRewardDoc,
      'userAddress' | 'reward' | 'protocolFeesWei' | 'protocolFeesEth' | 'protocolFeesUSDC'
    > = {
      sale,
      chainId: sale.chainId,
      isSplit: sale.isSplit ?? false,
      isAggregated: false,
      /**
       * buyer and seller both receive the full volume of the sale
       */
      volumeWei: parseEther(sale.price.toString()).toString(),
      volumeEth: sale.price,
      volumeUSDC: sale.price * sale.ethPrice,
      updatedAt: Date.now(),
      config,
      phaseId: phase.details.id,
      phaseName: phase.details.name,
      phaseIndex: phase.details.index
    };

    const buyer: TransactionFeeRewardDoc = {
      ...base,
      userAddress: sale.buyer,
      reward: buyerReward.reward,
      protocolFeesWei: buyerReward.protocolFeesWei,
      protocolFeesEth: buyerReward.protocolFeesEth,
      protocolFeesUSDC: buyerReward.protocolFeesUSDC
    };

    const seller: TransactionFeeRewardDoc = {
      ...base,
      userAddress: sale.seller,
      reward: sellerReward.reward,
      protocolFeesWei: sellerReward.protocolFeesWei,
      protocolFeesEth: sellerReward.protocolFeesEth,
      protocolFeesUSDC: sellerReward.protocolFeesUSDC
    };

    return {
      buyer,
      seller
    };
  }
}
